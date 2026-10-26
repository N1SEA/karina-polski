// AI-екзаменатор: будує запит до Claude і розбирає відповідь.
// Клієнт передається ззовні, щоб у тестах підставити фейк.

export const MODEL = "claude-opus-5-5";
const MAX_HISTORY = 40;
const MAX_TEXT = 2000;

export const DEFAULT_BASIS = "polskie pochodzenie (art. 195 ust. 1 pkt 3 ustawy o cudzoziemcach)";

const BASE = `Jesteś urzędniczką w urzędzie wojewódzkim w Polsce. Prowadzisz rozmowę z kandydatką, która składa wniosek o zezwolenie na pobyt stały. Podstawa wniosku jest podana w wiadomości — dopasuj pytania do niej. Sprawdzasz jej znajomość języka polskiego oraz polskich tradycji, świąt, zwyczajów i kultury, a także fakty związane z podstawą wniosku.
Kandydatka ma na imię Karina, jest Ukrainką, mówi po polsku na poziomie A2/B1: zna podstawy, ale gubi się w dłuższych wypowiedziach.
Jesteś jednocześnie cierpliwą NAUCZYCIELKĄ: rozmowa ma ją uczyć, nie tylko sprawdzać.
Feedback piszesz PO UKRAIŃSKU, krótko (1–3 zdania), życzliwie: najpierw krótko, co było dobrze, potem JEDNA najważniejsza rzecz do poprawy (merytoryczna albo językowa). Nie poprawiaj drobiazgów, jeśli sens jest jasny.
"corrected_pl" to jej odpowiedź przepisana poprawną, prostą polszczyzną (zachowaj jej treść, nie dopisuj dużo nowego); puste, jeśli była bezbłędna.
Część nauczycielska (pisz tylko to, co naprawdę pomaga; inaczej zostaw puste):
- "lesson_uk": po ukraińsku 1–3 zdania z wiedzą, której zabrakło w odpowiedzi albo którą urzędnik może dopytać (fakt, data, znaczenie zwyczaju, "dlaczego"). Konkretnie, bez lania wody.
- "phrases": 0–3 gotowe, krótkie zwroty po polsku (A2/B1) przydatne do odpowiedzi na to pytanie, każdy z tłumaczeniem na ukraiński.
- "grammar_uk": po ukraińsku jedna reguła gramatyczna, jeśli zrobiła ważny błąd (np. "dzielić się czymś" + narzędnik), z przykładem; inaczej puste.
Dopasuj trudność: gdy się gubi lub odpowiada bardzo krótko — pytaj prościej; gdy odpowiada pewnie — pytaj głębiej, o szczegóły i "dlaczego".`;

const TEACH_PROPS = {
  lesson_uk: { type: "string" },
  phrases: {
    type: "array",
    items: { type: "object", properties: { pl: { type: "string" }, uk: { type: "string" } }, required: ["pl", "uk"], additionalProperties: false },
  },
  grammar_uk: { type: "string" },
};
const TEACH_REQ = ["lesson_uk", "phrases", "grammar_uk"];

const SYSTEM_CHAT = `${BASE}
Zadajesz JEDNO krótkie pytanie naraz, prostym językiem, jak prawdziwy urzędnik. Pytania mają być KONKRETNE: o daty, nazwy, potrawy, zwyczaje, symbole i o jej własne doświadczenie ("Co Pani jadła w ostatnią Wigilię?", "Kiedy jest Boże Ciało?"), a nie ogólne ("Co Pani wie o Polsce?"). Często dopytuj o szczegóły jej odpowiedzi ("A jak to wygląda u Pani w domu?", "Co się wtedy je?"). Zmieniaj tematy w ramach wybranych tematów. Pytanie "next_question_pl" po polsku, "next_question_uk" to jego tłumaczenie na ukraiński.
Przy pierwszej wiadomości przywitaj się i zadaj pierwsze pytanie; wtedy "verdict" = "none", a pola oceny i część nauczycielska są puste.`;

const SYSTEM_CHECK = `${BASE}
Oceniasz jedną odpowiedź kandydatki na konkretne pytanie. Masz wzorcową odpowiedź jako punkt odniesienia — kandydatka nie musi powtarzać jej słowo w słowo, liczy się poprawna treść i zrozumiały polski.
W "tip_uk" daj jedną krótką radę po ukraińsku, co dodać lub zapamiętać.`;

const VERDICT = { type: "string", enum: ["good", "almost", "wrong", "none"] };

export const CHAT_SCHEMA = {
  type: "object",
  properties: {
    verdict: VERDICT,
    feedback_uk: { type: "string" },
    corrected_pl: { type: "string" },
    next_question_pl: { type: "string" },
    next_question_uk: { type: "string" },
    ...TEACH_PROPS,
  },
  required: ["verdict", "feedback_uk", "corrected_pl", "next_question_pl", "next_question_uk", ...TEACH_REQ],
  additionalProperties: false,
};

export const CHECK_SCHEMA = {
  type: "object",
  properties: {
    verdict: VERDICT,
    feedback_uk: { type: "string" },
    corrected_pl: { type: "string" },
    tip_uk: { type: "string" },
    ...TEACH_PROPS,
  },
  required: ["verdict", "feedback_uk", "corrected_pl", "tip_uk", ...TEACH_REQ],
  additionalProperties: false,
};

const SYSTEM_GENERATE = `Tworzysz nowe pytania do nauki przed rozmową w urzędzie wojewódzkim (pobyt stały; podstawa wniosku podana w wiadomości) dla Ukrainki na poziomie A2/B1.
Pytania mają być takie, jakie naprawdę zadaje urzędnik: wąskie i konkretne (jedna data, jeden zwyczaj, jedna potrawa, jeden symbol), nie ogólne, o polskich tradycjach, świętach, zwyczajach, kulturze, historii i życiu w Polsce. Fakty muszą być poprawne.
Dla każdego pytania:
- "q": pytanie po polsku (forma "Pani"),
- "qu": tłumaczenie pytania na ukraiński,
- "a": wzorcowa odpowiedź po polsku, prosta (A2/B1), 1–3 krótkie zdania, w 1. osobie rodzaju żeńskiego, jeśli mówi o sobie,
- "au": tłumaczenie odpowiedzi na ukraiński,
- "at": wymowa odpowiedzi "a" ukraińską cyrylicą: y→и, i→і, sz→ш, cz→ч, rz/ż→ж, ch/h→х, ł→в, ó/u→у, ś/si→сь, ć/ci→ць, ź/zi→зь, ń/ni→нь, nie→нє, się→сє, g→ґ, je→є, ja→я, ą→он, ę→ен (na końcu wyrazu: е); akcentowaną samogłoskę pisz WIELKĄ literą (zwykle przedostatnia sylaba), reszta małymi literami; liczby zapisz słowami.
Nie powtarzaj pytań z listy już istniejących.`;

export const GENERATE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { q: { type: "string" }, qu: { type: "string" }, a: { type: "string" }, au: { type: "string" }, at: { type: "string" } },
        required: ["q", "qu", "a", "au", "at"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// «Чат»: питання з банку по черзі, AI оцінює відповідь своїми словами й може поставити уточнення.
const SYSTEM_DRILL = `${BASE}
Rozmowa idzie według listy pytań. Dostajesz bieżące pytanie z listy, wzorcową odpowiedź (punkt odniesienia — kandydatka mówi własnymi słowami, nie musi jej powtarzać), przebieg rozmowy o tym pytaniu i to, co kandydatka powiedziała wcześniej.
Oceń OSTATNIĄ odpowiedź kandydatki: treść (czy jest poprawna i wystarczająca) i polski.
Jeśli pytania dodatkowe są dozwolone, a jej odpowiedź daje powód, zadaj JEDNO krótkie, konkretne pytanie dodatkowe dotyczące tego, co właśnie powiedziała (jak prawdziwy urzędnik: "A dlaczego…?", "Jak to wyglądało u Pani w domu?", "Co się wtedy je?"), spójne z tym, co mówiła wcześniej. Jeśli odpowiedź jest pełna albo pytania dodatkowe nie są dozwolone — "followup_pl" i "followup_uk" zostaw puste.
Wypowiedź mogła być podyktowana głosem: ignoruj brak interpunkcji i wielkich liter, oceniaj sens i formy wyrazów.`;

export const DRILL_SCHEMA = {
  type: "object",
  properties: {
    verdict: VERDICT,
    feedback_uk: { type: "string" },
    corrected_pl: { type: "string" },
    followup_pl: { type: "string" },
    followup_uk: { type: "string" },
    ...TEACH_PROPS,
  },
  required: ["verdict", "feedback_uk", "corrected_pl", "followup_pl", "followup_uk", ...TEACH_REQ],
  additionalProperties: false,
};

// «Поясни»: коротке пояснення теми питання, ключові фрази і простий взірець — до того, як вона відповідає.
const SYSTEM_EXPLAIN = `${BASE}
Teraz kandydatka nie wie, jak odpowiedzieć, i prosi o wyjaśnienie. Wytłumacz temat pytania jak nauczycielka:
- "lesson_uk": po ukraińsku 2–4 krótkie zdania: o co chodzi w pytaniu, najważniejsze fakty, czego urzędnik oczekuje;
- "phrases": 2–4 kluczowe zwroty po polsku (z tłumaczeniem na ukraiński), z których może zbudować odpowiedź;
- "sample_pl": prosta przykładowa odpowiedź (A2/B1, 2–3 zdania, 1. osoba rodzaju żeńskiego; dane osobiste jako [nawiasy]), "sample_uk" — jej tłumaczenie.
Nie zadawaj nowych pytań.`;

export const EXPLAIN_SCHEMA = {
  type: "object",
  properties: { lesson_uk: { type: "string" }, phrases: TEACH_PROPS.phrases, sample_pl: { type: "string" }, sample_uk: { type: "string" } },
  required: ["lesson_uk", "phrases", "sample_pl", "sample_uk"],
  additionalProperties: false,
};

export function buildExplainMessages({ question, model_answer, basis }) {
  const q = clip(question);
  if (!q) throw new BadRequest("question is required");
  return [{ role: "user", content: `${basisLine(basis)}
Pytanie: ${q}
Wzorcowa odpowiedź (dla ciebie): ${clip(model_answer) || "(brak)"}` }];
}

export class BadRequest extends Error {}

const clip = (s) => String(s ?? "").slice(0, MAX_TEXT).trim();
const basisLine = (b) => `Podstawa wniosku: ${clip(b).slice(0, 300) || DEFAULT_BASIS}.`;

// history: [{role: "examiner"|"karina", text}] — завжди закінчується відповіддю Каріни (або порожня).
export function buildChatMessages(history, topics, basis) {
  if (!Array.isArray(history)) throw new BadRequest("history must be an array");
  const topicLine = Array.isArray(topics) && topics.length ? `Tematy rozmowy: ${topics.map(clip).join(", ")}.` : "Tematy: polskie tradycje i święta, o sobie.";
  const messages = [{ role: "user", content: `Proszę zacząć rozmowę. ${basisLine(basis)} ${topicLine}` }];
  for (const turn of history.slice(-MAX_HISTORY)) {
    if (!turn || typeof turn !== "object") continue;
    const role = turn.role === "examiner" ? "assistant" : "user";
    const text = clip(turn.text);
    if (!text) continue;
    const last = messages[messages.length - 1];
    if (last.role === role) last.content += "\n" + text;
    else messages.push({ role, content: text });
  }
  if (messages[messages.length - 1].role !== "user") throw new BadRequest("last turn must be Karina's answer");
  return messages;
}

export function buildCheckMessages({ question, model_answer, answer, basis }) {
  const q = clip(question), a = clip(answer);
  if (!q || !a) throw new BadRequest("question and answer are required");
  return [{
    role: "user",
    content: `${basisLine(basis)}\nPytanie: ${q}\nWzorcowa odpowiedź: ${clip(model_answer) || "(brak)"}\nOdpowiedź kandydatki: ${a}`,
  }];
}

export function buildGenerateMessages({ topic, existing, count, basis }) {
  const t = clip(topic);
  if (!t) throw new BadRequest("topic is required");
  const n = Math.max(1, Math.min(Number(count) || 8, 12));
  const list = (Array.isArray(existing) ? existing : []).slice(-120).map((q) => "- " + clip(q).slice(0, 200)).join("\n");
  return [{ role: "user", content: `${basisLine(basis)}\nTemat: ${t}\nLiczba nowych pytań: ${n}\nIstniejące pytania (nie powtarzaj):\n${list || "(brak)"}` }];
}

// thread: [{role, text}] про поточне питання банку, закінчується відповіддю Каріни.
// earlier: її попередні відповіді в чаті — щоб уточнення були узгоджені з тим, що вона вже казала.
export function buildDrillMessages({ question, model_answer, thread, earlier, allow_followup, basis }) {
  const q = clip(question);
  if (!q) throw new BadRequest("question is required");
  const turns = (Array.isArray(thread) ? thread : []).filter((t) => t && typeof t === "object" && clip(t.text)).slice(-8);
  if (!turns.length || turns[turns.length - 1].role !== "karina") throw new BadRequest("last turn must be Karina's answer");
  const talk = turns.map((t) => (t.role === "examiner" ? "Urzędniczka: " : "Kandydatka: ") + clip(t.text).slice(0, 800)).join("\n");
  const before = (Array.isArray(earlier) ? earlier : []).map((s) => "- " + clip(s).slice(0, 300)).filter((s) => s.length > 2).slice(-6).join("\n");
  return [{
    role: "user",
    content: `${basisLine(basis)}\nPytanie z listy: ${q}\nWzorcowa odpowiedź: ${clip(model_answer) || "(brak)"}\n` +
      `Wcześniej kandydatka powiedziała:\n${before || "(nic)"}\nRozmowa o tym pytaniu:\n${talk}\n` +
      `Pytania dodatkowe: ${allow_followup ? "dozwolone (najwyżej jedno)" : "niedozwolone — przejdź dalej"}.`,
  }];
}

// Відкидає неповні або повторні питання з відповіді генератора.
export function cleanGenerated(items, existing) {
  const seen = new Set((existing || []).map((q) => String(q).trim().toLowerCase()));
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const row = {};
    for (const k of ["q", "qu", "a", "au", "at"]) row[k] = clip(it && it[k]);
    if (Object.values(row).some((v) => !v)) continue;
    const key = row.q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function parseResult(response) {
  if (response.stop_reason === "refusal") throw new Error("refusal");
  const text = (response.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

export async function runExaminer(client, body) {
  const mode = body && body.mode;
  let system, messages, schema;
  if (mode === "chat") {
    system = SYSTEM_CHAT; schema = CHAT_SCHEMA;
    messages = buildChatMessages(body.history || [], body.topics, body.basis);
  } else if (mode === "check") {
    system = SYSTEM_CHECK; schema = CHECK_SCHEMA;
    messages = buildCheckMessages(body);
  } else if (mode === "generate") {
    system = SYSTEM_GENERATE; schema = GENERATE_SCHEMA;
    messages = buildGenerateMessages(body);
  } else if (mode === "drill") {
    system = SYSTEM_DRILL; schema = DRILL_SCHEMA;
    messages = buildDrillMessages(body);
  } else if (mode === "explain") {
    system = SYSTEM_EXPLAIN; schema = EXPLAIN_SCHEMA;
    messages = buildExplainMessages(body);
  } else {
    throw new BadRequest("mode must be chat, check, drill, explain or generate");
  }
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  const result = parseResult(response);
  if (mode === "generate") return { items: cleanGenerated(result.items, body.existing) };
  return result;
}

// Спільний обробник для Vercel і локального сервера.
export async function handle({ method, headers, body }, { client, passcode }) {
  if (method !== "POST") return { status: 405, json: { error: "POST only" } };
  if (passcode && headers["x-passcode"] !== passcode) return { status: 401, json: { error: "wrong passcode" } };
  try {
    return { status: 200, json: await runExaminer(client, body) };
  } catch (e) {
    if (e instanceof BadRequest) return { status: 400, json: { error: e.message } };
    if (e.message === "refusal") return { status: 422, json: { error: "refusal" } };
    console.error("examiner error:", e && e.status, e && e.message);
    return { status: 502, json: { error: "ai unavailable" } };
  }
}
