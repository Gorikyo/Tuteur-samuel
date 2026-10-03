import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

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

async function handleVerification(request, response) {
  try {
    const payload = await readJson(request);
    if (!payload.image?.startsWith("data:image/")) {
      return sendJson(response, 400, { message: "Aucune feuille valide n’a été reçue." });
    }

    // Point de branchement sécurisé pour une future intégration OpenAI Vision.
    // La clé API restera ici, côté serveur, via process.env.OPENAI_API_KEY.
    // Le navigateur envoie uniquement l’image composée et ne voit jamais la clé.
    return sendJson(response, 200, {
      status: "prototype",
      message:
        "La photo et tes annotations ont bien été réunies. Le prototype est prêt ; la correction par intelligence artificielle sera connectée ici dans la prochaine étape.",
    });
  } catch (error) {
    return sendJson(response, 400, { message: error.message || "Requête invalide" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "POST" && url.pathname === "/api/verify") {
    return handleVerification(request, response);
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

