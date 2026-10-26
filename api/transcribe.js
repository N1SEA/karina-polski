// Vercel serverless function: POST /api/transcribe (тіло — аудіозапис).
// Змінні середовища: OPENAI_API_KEY, APP_PASSCODE, ALLOW_ORIGIN (необов'язково).
import { handleTranscribe, readBody } from "../lib/transcribe.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const origin = process.env.ALLOW_ORIGIN;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-passcode");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!process.env.APP_PASSCODE) return res.status(503).json({ error: "APP_PASSCODE is not set" });
  const body = req.method === "POST" ? await readBody(req) : null;
  const out = await handleTranscribe(
    { method: req.method, headers: req.headers, body },
    { apiKey: process.env.OPENAI_API_KEY, passcode: process.env.APP_PASSCODE }
  );
  res.status(out.status).json(out.json);
}
