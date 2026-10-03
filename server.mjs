import { createServer } from "node:http";
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const apiModel = process.env.OPENAI_MODEL || "gpt-6-luna";
const configDir = process.env.TUTEUR_CONFIG_DIR || join(homedir(), ".config", "tuteur-samuel");
const authFile = join(configDir, "chatgpt-auth.json");
const hostFile = join(configDir, "host.json");
const resource = "https://api.openai.com/v1";
const issuer = "https://auth.openai.com";
const redirectUri = `http://127.0.0.1:${port}/auth/openai/callback`;
const scopes = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const pending = new Map();
let modelCache = { until: 0, models: [] };

const correctionPrompt = `Tu es Tuteur Samuel, un tuteur scolaire patient pour un enfant.
Analyse très attentivement la photo de la feuille, y compris l'énoncé imprimé et les réponses ou annotations manuscrites.
Vérifie le raisonnement avant de signaler une faute. Ne corrige pas un élément ambigu ou illisible : indique plutôt qu'il faut le relire.

Retourne exclusivement un objet JSON valide, sans markdown, sous cette forme :
{
  "summary": "une phrase encourageante sur ce qui est compris ou réussi",
  "issues": [
    {
      "title": "titre très court du point à revoir",
      "hint": "indice bref qui aide sans donner immédiatement toute la réponse",
      "x": 500,
      "y": 500
    }
  ],
  "next_action": "une prochaine action très simple"
}

Signale au maximum quatre points. x et y désignent le centre de la faute sur une grille fixe de 0 à 999, origine en haut à gauche. Si la copie est correcte, renvoie issues vide. Si la photo n'est pas exploitable, explique-le dans summary et renvoie issues vide. Réponds uniquement en français.`;

const livePrompt = `Tu es Tuteur Samuel, un tuteur scolaire oral patient qui parle à un enfant en français.
Parle avec des phrases courtes, chaleureuses et naturelles. Ne donne pas immédiatement la solution complète : pose une question, écoute la réponse, puis donne un indice progressif.
Reste centré sur le devoir en cours. Félicite l'effort sans surjouer. Si tu n'es pas certain d'un élément visible sur la feuille, demande à l'enfant de le lire à voix haute.
Ne traite qu'un point à la fois. Évite les longues listes. La séance dure au maximum vingt minutes.`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}
function redirect(response, location) {
  response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  response.end();
}
async function requestJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 12_000_000) throw new Error("Image trop volumineuse");
  }
  return JSON.parse(body || "{}");
}
async function load(path) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function save(path, value) {
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}
const random = (size = 32) => randomBytes(size).toString("base64url");

async function getHostId() {
  const saved = await load(hostFile);
  if (saved?.id) return saved.id;
  const id = `urn:uuid:${randomUUID()}`;
  await save(hostFile, { id });
  return id;
}

async function tokenRequest(parameters) {
  const response = await fetch(`${issuer}/api/accounts/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(parameters),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error_description || result.error || "Connexion OpenAI refusée.");
    error.status = response.status;
    throw error;
  }
  return result;
}

async function validateIdToken(token, audience, nonce) {
  const parts = token?.split(".");
  if (parts?.length !== 3) throw new Error("Jeton d’identité invalide.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url"));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url"));
  if (!header.kid || !["RS256", "ES256"].includes(header.alg)) throw new Error("Signature d’identité non prise en charge.");
  const discovery = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json();
  const keys = await (await fetch(discovery.jwks_uri)).json();
  const jwk = keys.keys?.find((item) => item.kid === header.kid && item.alg === header.alg);
  if (!jwk) throw new Error("Clé de signature OpenAI introuvable.");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");
  const valid = header.alg === "ES256"
    ? verify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature)
    : verify("RSA-SHA256", data, key, signature);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== issuer || !audiences.includes(audience)) throw new Error("Identité OpenAI non vérifiée.");
  if (!claims.exp || claims.exp * 1000 <= Date.now() || claims.nonce !== nonce) throw new Error("Connexion OpenAI invalide ou expirée.");
  return claims;
}

async function validAuth() {
  let auth = await load(authFile);
  if (!auth?.access_token || !auth.scope?.split(" ").includes("chatgpt.tokens.use.direct")) return null;
  if (auth.expires_at > Date.now() + 60_000) return auth;
  try {
    const refreshed = await tokenRequest({
      grant_type: "refresh_token", client_id: auth.client_id,
      refresh_token: auth.refresh_token, resource,
    });
    auth = {
      ...auth, ...refreshed,
      refresh_token: refreshed.refresh_token || auth.refresh_token,
      id_token: refreshed.id_token || auth.id_token,
      expires_at: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
    };
    await save(authFile, auth);
    modelCache = { until: 0, models: [] };
    return auth;
  } catch { return null; }
}

async function listModels(auth) {
  if (modelCache.until > Date.now() && modelCache.models.length) return modelCache.models;
  const response = await fetch(`${resource}/models`, {
    headers: { Authorization: `Bearer ${auth.access_token}`, Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || "Impossible de charger les modèles.");
    error.status = response.status;
    throw error;
  }
  const models = (result.models || result.data || [])
    .filter((model) => model.visibility === undefined || model.visibility === "list")
    .map((model) => ({
      slug: model.slug || model.id,
      displayName: model.display_name || model.name || model.slug || model.id,
    }))
    .filter((model) => model.slug)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
  modelCache = { until: Date.now() + 300_000, models };
  return models;
}

function outputText(response) {
  return (response.output || []).flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text").map((part) => part.text).join("\n").trim();
}

function preferredModel(models) {
  const priorities = ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.5", "gpt-5.6-luna"];
  return priorities.find((slug) => models.some((model) => model.slug === slug)) || models[0]?.slug;
}

function structuredCorrection(rawMessage) {
  const cleaned = rawMessage.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 4).map((issue, index) => ({
      id: index + 1,
      title: String(issue.title || `Point ${index + 1}`).slice(0, 90),
      hint: String(issue.hint || "Relis cette partie.").slice(0, 320),
      x: Math.max(0, Math.min(999, Number(issue.x) || 500)),
      y: Math.max(0, Math.min(999, Number(issue.y) || 500)),
    })) : [];
    const summary = String(parsed.summary || "J’ai terminé la vérification.").slice(0, 600);
    const nextAction = String(parsed.next_action || "Relis les points indiqués.").slice(0, 300);
    return { summary, issues, nextAction, message: `${summary}\n\n${nextAction}` };
  } catch {
    return { summary: rawMessage, issues: [], nextAction: "Relis la correction puis essaie à nouveau.", message: rawMessage };
  }
}

async function streamText(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Flux de correction indisponible.");
  const decoder = new TextDecoder();
  let buffer = "", message = "", completed = false;
  const consume = (block) => {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      if (event.type === "response.output_text.delta") message += event.delta || "";
      if (event.type === "response.completed") {
        completed = true;
        if (!message) message = outputText(event.response || {});
      }
      if (["response.failed", "response.incomplete", "error"].includes(event.type)) {
        throw new Error(event.response?.error?.message || event.message || "La correction OpenAI n’a pas abouti.");
      }
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    let separator;
    while ((separator = buffer.indexOf("\n\n")) !== -1) {
      consume(buffer.slice(0, separator));
      buffer = buffer.slice(separator + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  if (!completed || !message.trim()) throw new Error("La correction reçue était vide.");
  return message.trim();
}

async function oauthCorrection(image, requestedModel, auth) {
  const models = await listModels(auth);
  const model = models.find((item) => item.slug === requestedModel)?.slug || preferredModel(models);
  if (!model) throw new Error("Aucun modèle ChatGPT compatible n’est disponible.");
  const response = await fetch(`${resource}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.access_token}` },
    body: JSON.stringify({
      model, store: false, stream: true, instructions: correctionPrompt,
      reasoning: { effort: "high" },
      input: [{ role: "user", content: [
        { type: "input_text", text: "Analyse cette feuille et aide l’enfant à corriger son travail." },
          { type: "input_image", image_url: image, detail: "original" },
      ] }],
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.error?.message || "Le service ChatGPT n’a pas répondu.");
    error.status = response.status;
    throw error;
  }
  return { ...structuredCorrection(await streamText(response)), model };
}

async function keyCorrection(image) {
  const response = await fetch(`${resource}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: apiModel, store: false, reasoning: { effort: "high" }, max_output_tokens: 1000,
      input: [{ role: "user", content: [
        { type: "input_text", text: correctionPrompt },
        { type: "input_image", image_url: image, detail: "original" },
      ] }],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message || "Le service OpenAI n'a pas répondu.");
    error.status = response.status;
    throw error;
  }
  const message = outputText(result);
  if (!message) throw new Error("La correction reçue était vide.");
  return { ...structuredCorrection(message), model: apiModel };
}

async function startOAuth(response) {
  const auth = await load(authFile);
  const state = random(), nonce = random(), verifier = random(48);
  pending.set(state, { verifier, nonce, created: Date.now(), isNew: !auth?.client_id });
  const parameters = new URLSearchParams({
    response_type: "code", client_id: auth?.client_id || "dynamic_agent_client",
    redirect_uri: redirectUri, scope: scopes, resource, state, nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256", ext_agent_host_id: await getHostId(),
  });
  if (!auth?.client_id) parameters.set("agent_name_hint", "Tuteur Samuel");
  if (auth?.id_token) parameters.set("id_token_hint", auth.id_token);
  redirect(response, `${issuer}/api/accounts/authorize?${parameters}`);
}

async function finishOAuth(url, response) {
  const state = url.searchParams.get("state");
  const attempt = pending.get(state);
  pending.delete(state);
  if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error_description") || "Connexion annulée.");
  if (!attempt || attempt.created < Date.now() - 600_000) throw new Error("Cette connexion a expiré.");
  const existing = await load(authFile);
  const clientId = attempt.isNew ? url.searchParams.get("client_id") : existing?.client_id;
  const code = url.searchParams.get("code");
  if (!clientId || !code) throw new Error("Réponse OpenAI incomplète.");
  const tokens = await tokenRequest({
    grant_type: "authorization_code", code, client_id: clientId,
    redirect_uri: redirectUri, code_verifier: attempt.verifier, resource,
  });
  const claims = await validateIdToken(tokens.id_token, clientId, attempt.nonce);
  await save(authFile, {
    ...tokens, client_id: clientId,
    expires_at: Date.now() + Number(tokens.expires_in || 3600) * 1000,
    profile: { sub: claims.sub, email: claims.email || "", name: claims.name || claims.preferred_username || "" },
  });
  modelCache = { until: 0, models: [] };
  redirect(response, "/?connected=1");
}

async function checkHomework(request, response) {
  try {
    const payload = await requestJson(request);
    if (!payload.image?.startsWith("data:image/")) return json(response, 400, { message: "Aucune feuille valide n’a été reçue." });
    const auth = await validAuth();
    if (auth) return json(response, 200, { status: "complete", mode: "chatgpt", ...await oauthCorrection(payload.image, payload.model, auth) });
    if (process.env.OPENAI_API_KEY) return json(response, 200, { status: "complete", mode: "api-key", ...await keyCorrection(payload.image) });
    return json(response, 200, { status: "prototype", mode: "setup", message: "La feuille est prête. Connecte ChatGPT pour recevoir une vraie correction." });
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 ? 502 : 400;
    json(response, status, { message: status === 502
      ? "La correction par IA est momentanément indisponible. Vérifie ta connexion ou réessaie."
      : error.message || "Requête invalide" });
  }
}

async function createLiveSession(request, response) {
  if (!process.env.OPENAI_API_KEY) return json(response, 503, { message: "La clé API vocale n’est pas configurée." });
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) return json(response, 403, { message: "Origine non autorisée." });
    } catch { return json(response, 403, { message: "Origine non autorisée." }); }
  }
  const payload = await requestJson(request);
  if (typeof payload.sdp !== "string" || !payload.sdp.trim() || payload.sdp.length > 64_000) {
    return json(response, 400, { message: "Connexion audio invalide." });
  }
  const context = typeof payload.context === "string" ? payload.context.slice(0, 4_000) : "";
  const openAIResponse = await fetch(`${resource}/live/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "tuteur-samuel-local-child",
    },
    body: JSON.stringify({
      session: {
        model: "gpt-live-1",
        instructions: context ? `${livePrompt}\n\nContexte de la correction actuelle :\n${context}` : livePrompt,
        audio: { output: { voice: "marin" } },
        store: false,
      },
      transport: { type: "webrtc", sdp: payload.sdp },
    }),
  });
  const result = await openAIResponse.json().catch(() => ({}));
  if (!openAIResponse.ok) {
    const error = new Error(result.error?.message || "La conversation Live n’a pas pu démarrer.");
    error.status = openAIResponse.status;
    throw error;
  }
  return json(response, 201, result);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/auth/openai/start") return await startOAuth(response);
    if (request.method === "GET" && url.pathname === "/auth/openai/callback") return await finishOAuth(url, response);
    if (request.method === "POST" && url.pathname === "/auth/openai/logout") {
      await rm(authFile, { force: true }); modelCache = { until: 0, models: [] };
      return json(response, 200, { connected: false });
    }
    if (request.method === "POST" && url.pathname === "/api/verify") return await checkHomework(request, response);
    if (request.method === "POST" && url.pathname === "/api/live/session") return await createLiveSession(request, response);
    if (request.method === "GET" && url.pathname === "/api/status") {
      const auth = await validAuth();
      return json(response, 200, {
        aiConfigured: Boolean(auth || process.env.OPENAI_API_KEY), authConnected: Boolean(auth),
        provider: auth ? "chatgpt" : process.env.OPENAI_API_KEY ? "api-key" : "none",
        email: auth?.profile?.email || "", name: auth?.profile?.name || "", model: apiModel,
        liveConfigured: Boolean(process.env.OPENAI_API_KEY),
      });
    }
    if (request.method === "GET" && url.pathname === "/api/models") {
      const auth = await validAuth();
      if (!auth) return json(response, 200, { models: [], selected: null });
      const models = await listModels(auth);
      return json(response, 200, { models, selected: preferredModel(models) || null });
    }
  } catch (error) {
    if (url.pathname.startsWith("/auth/openai/")) return redirect(response, `/?auth_error=${encodeURIComponent(error.message || "Connexion impossible")}`);
    return json(response, 500, { message: error.message || "Erreur interne" });
  }
  if (!["GET", "HEAD"].includes(request.method)) return json(response, 405, { message: "Méthode non autorisée" });
  const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = join(root, safe);
  try {
    const contents = await readFile(file);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch { json(response, 404, { message: "Page introuvable" }); }
});

server.listen(port, host, () => console.log(`Tuteur Samuel est disponible sur http://127.0.0.1:${port}`));
