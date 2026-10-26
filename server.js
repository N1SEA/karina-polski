// Локальний сервер: статика + /api/examiner. Ключ береться з .env.local (не комітиться).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./lib/examiner.js";
import { handleTranscribe, readBody } from "./lib/transcribe.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
};
const PUBLIC = new Set(["index.html", "styles.css", "app.js", "data.js", "srs.js", "sw.js", "manifest.webmanifest"]);

let client = null;
async function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
  }
  return client;
}

const port = Number(process.env.PORT) || 5174;
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/transcribe") {
    const body = req.method === "POST" ? await readBody(req) : null;
    const out = await handleTranscribe({ method: req.method, headers: req.headers, body }, { apiKey: process.env.OPENAI_API_KEY, passcode: process.env.APP_PASSCODE });
    res.writeHead(out.status, { "content-type": "application/json" });
    return res.end(JSON.stringify(out.json));
  }
  if (url.pathname === "/api/examiner") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
    const c = await getClient();
    const out = !c
      ? { status: 503, json: { error: "no api key" } }
      : body === null
        ? { status: 400, json: { error: "bad json" } }
        : await handle({ method: req.method, headers: req.headers, body }, { client: c, passcode: process.env.APP_PASSCODE });
    res.writeHead(out.status, { "content-type": "application/json" });
    return res.end(JSON.stringify(out.json));
  }
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  if (!PUBLIC.has(rel) && !rel.startsWith("icons/")) { res.writeHead(404); return res.end("not found"); }
  const file = path.join(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
