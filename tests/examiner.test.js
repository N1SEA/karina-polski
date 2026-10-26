import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatMessages, buildCheckMessages, buildGenerateMessages, buildDrillMessages, cleanGenerated, parseResult, handle, MODEL, BadRequest } from "../lib/examiner.js";

test("generate: topic required, count clamped, existing listed", () => {
  assert.throws(() => buildGenerateMessages({ topic: "" }), BadRequest);
  const m = buildGenerateMessages({ topic: "Różdżka", existing: ["Co to jest opłatek?"], count: 99 });
  assert.match(m[0].content, /Liczba nowych pytań: 12/);
  assert.match(m[0].content, /- Co to jest opłatek\?/);
});

test("generate: drops incomplete and duplicate items", () => {
  const full = { q: "Nowe?", qu: "Нове?", a: "Tak.", au: "Так.", at: "так." };
  const out = cleanGenerated([full, { ...full }, { ...full, q: "Co to jest opłatek?" }, { ...full, q: "Inne?", at: "" }, null], ["co to jest opłatek?"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].q, "Nowe?");
});

test("handle: generate returns cleaned items", async () => {
  const items = [{ q: "A?", qu: "А?", a: "a", au: "а", at: "а" }, { q: "A?", qu: "А?", a: "a", au: "а", at: "а" }];
  const out = await handle({ method: "POST", headers: {}, body: { mode: "generate", topic: "Wigilia", existing: [] } }, { client: fakeClient(textReply({ items })) });
  assert.equal(out.status, 200);
  assert.equal(out.json.items.length, 1);
});

function fakeClient(reply, capture = {}) {
  return {
    beta: {
      messages: {
        create: async (params) => {
          capture.params = params;
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    },
  };
}
const textReply = (obj) => ({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(obj) }] });

test("first chat turn starts with a user message only", () => {
  const m = buildChatMessages([], ["Boże Narodzenie"]);
  assert.equal(m.length, 1);
  assert.equal(m[0].role, "user");
  assert.match(m[0].content, /Boże Narodzenie/);
});

test("chat history alternates roles and ends with Karina", () => {
  const m = buildChatMessages([
    { role: "examiner", text: "Dzień dobry. Jak się Pani nazywa?" },
    { role: "karina", text: "Nazywam się Karina." },
  ]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
});

test("consecutive same-role turns are merged and empty ones dropped", () => {
  const m = buildChatMessages([
    { role: "examiner", text: "Pytanie?" },
    { role: "karina", text: "Raz" },
    { role: "karina", text: "  " },
    { role: "karina", text: "Dwa" },
  ]);
  assert.equal(m.length, 3);
  assert.equal(m[2].content, "Raz\nDwa");
});

test("chat history ending with the examiner is rejected", () => {
  assert.throws(() => buildChatMessages([{ role: "examiner", text: "Pytanie?" }]), BadRequest);
  assert.throws(() => buildChatMessages("nope"), BadRequest);
});

test("long texts are clipped", () => {
  const m = buildChatMessages([{ role: "examiner", text: "Q" }, { role: "karina", text: "x".repeat(10000) }]);
  assert.ok(m[2].content.length <= 2000);
});

test("check requires question and answer", () => {
  assert.throws(() => buildCheckMessages({ question: "Q", answer: "" }), BadRequest);
  const m = buildCheckMessages({ question: "Co to jest opłatek?", model_answer: "Wafel", answer: "To wafel" });
  assert.match(m[0].content, /Odpowiedź kandydatki: To wafel/);
});

test("parseResult reads the text block and rejects refusals", () => {
  assert.deepEqual(parseResult(textReply({ verdict: "good" })), { verdict: "good" });
  assert.throws(() => parseResult({ stop_reason: "refusal", content: [] }), /refusal/);
});

test("handle: sends model, schema and fallbacks; returns parsed JSON", async () => {
  const cap = {};
  const out = await handle(
    { method: "POST", headers: {}, body: { mode: "check", question: "Q", model_answer: "A", answer: "B" } },
    { client: fakeClient(textReply({ verdict: "almost", feedback_uk: "f", corrected_pl: "c", tip_uk: "t" }), cap) }
  );
  assert.equal(out.status, 200);
  assert.equal(out.json.verdict, "almost");
  assert.equal(cap.params.model, MODEL);
  assert.equal(cap.params.output_config.format.type, "json_schema");
  assert.equal(cap.params.fallbacks, "default");
  assert.equal("temperature" in cap.params, false);
  assert.equal("thinking" in cap.params, false);
});

test("handle: passcode, method and mode errors", async () => {
  const client = fakeClient(textReply({}));
  assert.equal((await handle({ method: "GET", headers: {}, body: {} }, { client })).status, 405);
  assert.equal((await handle({ method: "POST", headers: {}, body: { mode: "chat" } }, { client, passcode: "x" })).status, 401);
  assert.equal((await handle({ method: "POST", headers: { "x-passcode": "x" }, body: { mode: "chat", history: [] } }, { client, passcode: "x" })).status, 200);
  assert.equal((await handle({ method: "POST", headers: {}, body: { mode: "other" } }, { client })).status, 400);
});

test("handle: API failure and refusal map to safe statuses", async () => {
  const orig = console.error; console.error = () => {};
  try {
    const failing = fakeClient(Object.assign(new Error("boom"), { status: 529 }));
    assert.equal((await handle({ method: "POST", headers: {}, body: { mode: "chat", history: [] } }, { client: failing })).status, 502);
  } finally { console.error = orig; }
  const refusing = fakeClient({ stop_reason: "refusal", content: [] });
  assert.equal((await handle({ method: "POST", headers: {}, body: { mode: "chat", history: [] } }, { client: refusing })).status, 422);
});

test("basis goes into every prompt, with a default", async () => {
  assert.match(buildChatMessages([], [], "małżeństwo")[0].content, /Podstawa wniosku: małżeństwo\./);
  assert.match(buildChatMessages([], [])[0].content, /polskie pochodzenie/);
  assert.match(buildCheckMessages({ question: "Q", answer: "A", basis: "Karta Polaka" })[0].content, /Karta Polaka/);
  assert.match(buildGenerateMessages({ topic: "T" })[0].content, /Podstawa wniosku: polskie pochodzenie/);
});

test("null turns in history are ignored, not a server error", () => {
  const m = buildChatMessages([null, { role: "examiner", text: "Q?" }, 5, { role: "karina", text: "A" }]);
  assert.deepEqual(m.map((x) => x.role), ["user", "assistant", "user"]);
});

test("drill: needs a question and Karina's last answer", () => {
  assert.throws(() => buildDrillMessages({ question: "", thread: [{ role: "karina", text: "x" }] }), BadRequest);
  assert.throws(() => buildDrillMessages({ question: "Q?", thread: [{ role: "examiner", text: "Q?" }] }), BadRequest);
  assert.throws(() => buildDrillMessages({ question: "Q?", thread: [] }), BadRequest);
});

test("drill: prompt carries model answer, thread, earlier answers and follow-up permission", () => {
  const m = buildDrillMessages({
    question: "Co to jest opłatek?", model_answer: "Cienki wafel.",
    thread: [{ role: "examiner", text: "Co to jest opłatek?" }, null, { role: "karina", text: "to wafel" }],
    earlier: ["Mam dwoje dzieci."], allow_followup: true,
  });
  const c = m[0].content;
  assert.match(c, /Wzorcowa odpowiedź: Cienki wafel\./);
  assert.match(c, /Kandydatka: to wafel/);
  assert.match(c, /- Mam dwoje dzieci\./);
  assert.match(c, /dozwolone \(najwyżej jedno\)/);
  assert.match(buildDrillMessages({ question: "Q?", thread: [{ role: "karina", text: "a" }] })[0].content, /niedozwolone/);
});

test("handle: drill returns feedback and optional follow-up", async () => {
  const reply = { verdict: "almost", feedback_uk: "f", corrected_pl: "c", followup_pl: "A dlaczego?", followup_uk: "А чому?" };
  const cap = {};
  const out = await handle({ method: "POST", headers: {}, body: { mode: "drill", question: "Q?", thread: [{ role: "karina", text: "a" }], allow_followup: true } }, { client: fakeClient(textReply(reply), cap) });
  assert.equal(out.status, 200);
  assert.equal(out.json.followup_pl, "A dlaczego?");
  assert.ok(cap.params.output_config.format.schema.required.includes("followup_pl"));
});
