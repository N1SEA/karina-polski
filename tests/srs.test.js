import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBrowser } from "./load.js";

const { SRS, DATA } = loadBrowser();
const DAY = 86400000;
const now = 1_800_000_000_000;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

test("grade 'know' promotes box and schedules by interval", () => {
  let s = SRS.grade({}, "a", 2, now);
  assert.equal(s.a.box, 1);
  assert.equal(s.a.due, now + SRS.INTERVALS[1] * DAY);
  s = SRS.grade(s, "a", 2, now);
  assert.equal(s.a.box, 2);
  assert.equal(s.a.seen, 2);
});

test("box never exceeds the last interval", () => {
  let s = {};
  for (let i = 0; i < 10; i++) s = SRS.grade(s, "a", 2, now);
  assert.equal(s.a.box, SRS.INTERVALS.length - 1);
});

test("grade 'don't know' resets to box 0 and is due soon", () => {
  let s = { a: { box: 4, due: now + 99 * DAY, seen: 5 } };
  s = SRS.grade(s, "a", 0, now);
  assert.equal(s.a.box, 0);
  assert.ok(s.a.due - now <= 5 * 60000);
});

test("grade 'almost' keeps box between 1 and 2", () => {
  assert.equal(SRS.grade({}, "a", 1, now).a.box, 1);
  assert.equal(SRS.grade({ a: { box: 4, due: 0, seen: 1 } }, "a", 1, now).a.box, 2);
});

test("grade does not mutate the input state", () => {
  const s = {};
  SRS.grade(s, "a", 2, now);
  assert.deepEqual(s, {});
});

test("pickNext prefers due cards with the lowest box, then new ones", () => {
  const state = {
    a: { box: 2, due: now - 1, seen: 1 },
    b: { box: 0, due: now - 1, seen: 1 },
    c: { box: 0, due: now + DAY, seen: 1 },
  };
  assert.equal(SRS.pickNext(["a", "b", "c", "d"], state, now, () => 0), "b");
  const noDue = { a: { box: 1, due: now + DAY, seen: 1 } };
  assert.equal(SRS.pickNext(["a", "d"], noDue, now, () => 0), "d");
});

test("pickNext falls back to the soonest card and skips the excluded one", () => {
  const state = { a: { box: 1, due: now + 2 * DAY, seen: 1 }, b: { box: 1, due: now + DAY, seen: 1 } };
  assert.equal(SRS.pickNext(["a", "b"], state, now), "b");
  assert.equal(SRS.pickNext(["a", "b"], state, now, null, "b"), "a");
  assert.equal(SRS.pickNext(["a"], state, now, null, "a"), "a");
  assert.equal(SRS.pickNext([], state, now), null);
});

test("stats counts learned / learning / fresh", () => {
  const st = SRS.stats(["a", "b", "c", "d"], { a: { box: 3 }, b: { box: 4 }, c: { box: 1 } });
  assert.deepEqual({ ...st }, { total: 4, learned: 2, learning: 1, fresh: 1, percent: 50 });
  assert.equal(SRS.stats([], {}).percent, 0);
});

test("buildQuiz returns 4 distinct options including the right one", () => {
  for (let k = 0; k < 30; k++) {
    const item = DATA[k * 3 % DATA.length];
    const qz = SRS.buildQuiz(item, DATA);
    assert.equal(qz.options.length, 4);
    assert.equal(new Set(qz.options).size, 4);
    assert.equal(qz.options[qz.correctIndex], item.a);
  }
});

test("buildQuiz prefers distractors from the same category", () => {
  const item = DATA.find((d) => d.cat === "bn");
  const qz = SRS.buildQuiz(item, DATA, seq(0.3, 0.7, 0.1));
  const sameCat = new Set(DATA.filter((d) => d.cat === "bn").map((d) => d.a));
  assert.ok(qz.options.every((o) => sameCat.has(o)));
});

test("tickets: every question lands in a ticket, all tickets full, order stable", () => {
  const ids = DATA.map(SRS.idOf);
  const t1 = SRS.tickets(ids, 10), t2 = SRS.tickets(ids, 10);
  assert.equal(t1.length, Math.ceil(ids.length / 10));
  assert.deepEqual(JSON.stringify(t1), JSON.stringify(t2));
  for (const t of t1) { assert.equal(t.length, 10); assert.equal(new Set(t).size, 10); }
  assert.equal(new Set(t1.flat()).size, ids.length);
  assert.equal(SRS.tickets([], 10).length, 0);
});

test("randomTicket includes weak questions and has no duplicates", () => {
  const ids = Array.from({ length: 50 }, (_, i) => "id" + i);
  const t = SRS.randomTicket(ids, { id3: { box: 0 } }, { id7: 1 }, 10);
  assert.equal(t.length, 10);
  assert.equal(new Set(t).size, 10);
  assert.ok(t.includes("id3") && t.includes("id7"));
  assert.equal(SRS.randomTicket(["a", "b"], {}, {}, 10).length, 2);
});

test("planDay covers 30 days and rejects out-of-range days", () => {
  assert.equal(SRS.planDay(0), null);
  assert.equal(SRS.planDay(31), null);
  assert.deepEqual([...SRS.planDay(1).cats], ["ratunek"]);
  assert.equal(SRS.planDay(25).review, true);
  for (let d = 1; d <= 30; d++) assert.ok(SRS.planDay(d).task);
});

test("buildQuiz never repeats an option even with duplicate answers in the pool", () => {
  const pool = [{ cat: "x", a: "A" }, { cat: "x", a: "B" }, { cat: "x", a: "B" }, { cat: "x", a: "C" }, { cat: "y", a: "D" }];
  const qz = SRS.buildQuiz(pool[0], pool);
  assert.equal(new Set(qz.options).size, qz.options.length);
  assert.equal(qz.options.length, 4);
});
