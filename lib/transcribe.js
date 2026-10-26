// Розпізнавання польської мови з запису (OpenAI). Claude аудіо не приймає, тому окремий сервіс.
// fetchImpl передається ззовні, щоб у тестах підставити фейк.

export const STT_MODEL = "gpt-4o-mini-transcribe";
export const MAX_AUDIO = 4 * 1024 * 1024; // ліміт тіла запиту на Vercel ~4.5 МБ

// Підказка моделі: тематична лексика покращує написання назв свят і діакритику.
const PROMPT = "Rozmowa w urzędzie po polsku: Wigilia, opłatek, Boże Narodzenie, Wielkanoc, święconka, pradziadkowie, Karta Polaka, pobyt stały.";

const EXT = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a", "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav" };

export function audioExt(contentType) {
  const base = String(contentType || "").split(";")[0].trim().toLowerCase();
  return EXT[base] || null;
}

export async function handleTranscribe({ method, headers, body }, { apiKey, passcode, fetchImpl }) {
  if (method !== "POST") return { status: 405, json: { error: "POST only" } };
  if (passcode && headers["x-passcode"] !== passcode) return { status: 401, json: { error: "wrong passcode" } };
  if (!apiKey) return { status: 503, json: { error: "no stt key" } };
  const ext = audioExt(headers["content-type"]);
  if (!ext) return { status: 415, json: { error: "unsupported audio type" } };
  if (!body || !body.length) return { status: 400, json: { error: "empty audio" } };
  if (body.length > MAX_AUDIO) return { status: 413, json: { error: "audio too long" } };

  const form = new FormData();
  form.append("file", new Blob([body], { type: headers["content-type"] }), "nagranie." + ext);
  form.append("model", STT_MODEL);
  form.append("language", "pl");
  form.append("prompt", PROMPT);
  try {
    const r = await (fetchImpl || fetch)("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form,
    });
    if (!r.ok) {
      console.error("stt error:", r.status);
      return { status: 502, json: { error: "stt unavailable" } };
    }
    const j = await r.json();
    return { status: 200, json: { text: String(j.text || "").trim() } };
  } catch (e) {
    console.error("stt error:", e && e.message);
    return { status: 502, json: { error: "stt unavailable" } };
  }
}

// Читає сире тіло запиту (аудіо) з обмеженням розміру.
export async function readBody(req, limit = MAX_AUDIO) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) return Buffer.concat(chunks.concat(c)); // handleTranscribe поверне 413
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
