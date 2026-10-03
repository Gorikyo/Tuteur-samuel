import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const openAIModel = process.env.OPENAI_MODEL || "gpt-6-luna";

const correctionPrompt = `Tu es Tuteur Samuel, un tuteur scolaire patient pour un enfant.
Analyse la photo de la feuille de devoir, y compris les annotations manuscrites ajoutées par l'enfant.
Réponds uniquement en français, avec un ton encourageant et des phrases courtes.

Ta réponse doit :
1. dire ce qui semble correct ;
2. signaler au maximum trois erreurs ou points à revoir ;
3. donner un indice pour chaque erreur sans révéler immédiatement toute la réponse ;
4. terminer par une prochaine action très simple.

Si la photo n'est pas lisible ou ne montre pas un devoir, explique-le clairement sans inventer.`;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 12_000_000) throw new Error("Image trop volumineuse");
  }
  return JSON.parse(body || "{}");
}

function extractOutputText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

async function verifyWithOpenAI(image) {
  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: openAIModel,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 700,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: correctionPrompt },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        },
      ],
    }),
  });

  const result = await apiResponse.json();
  if (!apiResponse.ok) {
    const error = new Error(result.error?.message || "Le service OpenAI n'a pas répondu.");
    error.status = apiResponse.status;
    throw error;
  }

  const message = extractOutputText(result);
  if (!message) throw new Error("La correction reçue était vide.");
  return message;
}

async function handleVerification(request, response) {
  try {
    const payload = await readJson(request);
    if (!payload.image?.startsWith("data:image/")) {
      return sendJson(response, 400, { message: "Aucune feuille valide n’a été reçue." });
    }

    if (process.env.OPENAI_API_KEY) {
      const correction = await verifyWithOpenAI(payload.image);
      return sendJson(response, 200, {
        status: "complete",
        mode: "openai",
        message: correction,
      });
    }

    return sendJson(response, 200, {
      status: "prototype",
      mode: "setup",
      message:
        "La feuille et les annotations sont prêtes. Pour recevoir une vraie correction, lance une fois « Configurer OpenAI » sur le Mac, puis redémarre Tuteur Samuel.",
    });
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 ? 502 : 400;
    return sendJson(response, status, {
      message:
        status === 502
          ? "La correction par IA est momentanément indisponible. Vérifie la clé OpenAI ou réessaie dans quelques instants."
          : error.message || "Requête invalide",
    });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/verify") {
    return handleVerification(request, response);
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    return sendJson(response, 200, {
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      model: openAIModel,
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return sendJson(response, 405, { message: "Méthode non autorisée" });
  }

  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const safePath = normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(root, safePath);

  try {
    const contents = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    sendJson(response, 404, { message: "Page introuvable" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Tuteur Samuel est disponible sur http://127.0.0.1:${port}`);
});
