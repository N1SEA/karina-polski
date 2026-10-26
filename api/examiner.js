// Vercel serverless function: POST /api/examiner
// Змінні середовища: ANTHROPIC_API_KEY, APP_PASSCODE, ALLOW_ORIGIN (напр. https://імʼя.github.io).
import Anthropic from "@anthropic-ai/sdk";
import { handle } from "../lib/examiner.js";

const client = new Anthropic();

export default async function handler(req, res) {
  const origin = process.env.ALLOW_ORIGIN;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, x-passcode");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  // Без коду доступу ключ був би відкритий для всіх — не обслуговуємо.
  if (!process.env.APP_PASSCODE) return res.status(503).json({ error: "APP_PASSCODE is not set" });
  const out = await handle(
    { method: req.method, headers: req.headers, body: req.body },
    { client, passcode: process.env.APP_PASSCODE }
  );
  res.status(out.status).json(out.json);
}
