import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadBrowser } from "./load.js";

const { SRS, DATA } = loadBrowser();
const A = "Wigilia jest 24 grudnia. Boże Narodzenie to 25 i 26 grudnia, a Pasterka jest o północy.";

test("sentences splits on sentence punctuation", () => {
  assert.equal(SRS.sentences(A).length, 2);
  assert.equal(SRS.sentences("Jedno zdanie").length, 1);
});

test("keywords picks numbers, long and proper words in text order, no duplicates", () => {
  const k = [...SRS.keywords(A, 4)];
  assert.equal(k.length, 4);
  assert.ok(k.includes("24"));
  assert.equal(new Set(k.map((w) => w.toLowerCase())).size, k.length);
  const order = k.map((w) => A.indexOf(w));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("keywords skips [placeholders] and stop words", () => {
  const k = [...SRS.keywords("Mieszkam w Polsce od [20..] roku, czyli już [..] lat.", 4)];
  assert.ok(!k.some((w) => w.startsWith("[")));
  assert.ok(!k.includes("czyli"));
});

test("starts gives the first words of every sentence", () => {
  assert.deepEqual([...SRS.starts(A, 2)], ["Wigilia jest …", "Boże Narodzenie …"]);
});

test("chunks rebuild the exact answer and stay short", () => {
  for (const d of DATA) {
    const c = SRS.chunks(d.a);
    assert.equal(c.join(" ").replace(/\s+/g, " "), d.a.replace(/\s+/g, " "));
    assert.ok(c.every((x) => x.split(/\s+/).length <= 4), d.a);
  }
});

test("cloze gaps rebuild the answer for every bank entry", () => {
  for (const d of DATA) {
    const parts = SRS.cloze(d.a, 2);
    const back = parts.map((p) => (p.gap ? p.gap : p.t)).join("");
    assert.equal(back, d.a);
  }
  const p = SRS.cloze(A, 2);
  assert.equal(p.filter((x) => x.gap).length, 2);
});

test("checkWord tolerates diacritics, case, one typo and endings", () => {
  assert.equal(SRS.checkWord("Opłatkiem", "opłatkiem"), "exact");
  assert.equal(SRS.checkWord("oplatkiem", "opłatkiem"), "exact");
  assert.equal(SRS.checkWord("opłatkem", "opłatkiem"), "close");
  assert.equal(SRS.checkWord("opłatek", "opłatkiem"), "close");
  assert.equal(SRS.checkWord("karp", "opłatkiem"), "wrong");
  assert.equal(SRS.checkWord("  ", "opłatkiem"), "empty");
  assert.equal(SRS.checkWord("25", "24"), "wrong");
});

test("sentences keeps decimals and dates together (no lookbehind needed)", () => {
  assert.deepEqual([...SRS.sentences("Wigilia jest 24.12. Potem są święta! Koniec")], ["Wigilia jest 24.12.", "Potem są święta!", "Koniec"]);
  assert.ok(!/\(\?<[=!]/.test(sources()));
});
function sources() { return fs.readFileSync(new URL("../srs.js", import.meta.url), "utf8") + fs.readFileSync(new URL("../app.js", import.meta.url), "utf8"); }
