import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBrowser } from "./load.js";

const { DATA, CATS, SRS } = loadBrowser();
const catIds = new Set(CATS.map((c) => c.id));

test("bank is not empty and every entry has a known category", () => {
  assert.ok(DATA.length >= 100, `only ${DATA.length} entries`);
  for (const d of DATA) assert.ok(catIds.has(d.cat), `unknown cat ${d.cat} in "${d.q}"`);
});

test("every entry has non-empty Polish question and answer", () => {
  for (const d of DATA) {
    assert.ok(d.q && d.q.trim(), "empty q");
    assert.ok(d.a && d.a.trim(), `empty a for "${d.q}"`);
  }
});

test("every entry has Ukrainian translation and transcription", () => {
  const missing = DATA.filter((d) => !d.qu || !d.au || !d.at).map((d) => d.q);
  assert.equal(missing.length, 0, missing.join("\n"));
});

test("transcription is Cyrillic (Latin only inside [placeholders])", () => {
  for (const d of DATA) {
    const outside = String(d.at || "").replace(/\[[^\]]*\]/g, "");
    assert.ok(!/[A-Za-ząćęłńóśźż]/.test(outside.replace(/[АЕЄИІЇОУЮЯ]/g, "")), `Latin in transcription of "${d.q}": ${d.at}`);
  }
});

test("ids are unique (no duplicate questions in a category)", () => {
  const ids = DATA.map(SRS.idOf);
  assert.equal(new Set(ids).size, ids.length);
});

test("each category has enough entries for a 4-option quiz", () => {
  for (const c of CATS) {
    const n = DATA.filter((d) => d.cat === c.id).length;
    assert.ok(n >= 4, `${c.id} has ${n}`);
  }
});

test("every category is reachable from the 30-day plan", () => {
  const planned = new Set();
  for (let day = 1; day <= 30; day++) SRS.planDay(day).cats.forEach((c) => planned.add(c));
  for (const c of CATS) assert.ok(planned.has(c.id), `${c.id} not in plan`);
});
