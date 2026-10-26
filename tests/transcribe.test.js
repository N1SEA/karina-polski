import { test } from "node:test";
import assert from "node:assert/strict";
import { handleTranscribe, audioExt, MAX_AUDIO, STT_MODEL } from "../lib/transcribe.js";

const audio = Buffer.from("fake-audio-bytes");
const req = (over = {}) => ({ method: "POST", headers: { "content-type": "audio/mp4", "x-passcode": "k" }, body: audio, ...over });

test("audioExt maps iPhone and Android recorder formats", () => {
  assert.equal(audioExt("audio/mp4"), "m4a");
  assert.equal(audioExt("audio/webm;codecs=opus"), "webm");
  assert.equal(audioExt("audio/ogg"), "ogg");
  assert.equal(audioExt("text/plain"), null);
  assert.equal(audioExt(undefined), null);
});

test("transcribe: method, passcode, missing key, type, size", async () => {
  const fetchImpl = async () => { throw new Error("must not be called"); };
  assert.equal((await handleTranscribe(req({ method: "GET" }), { apiKey: "x", passcode: "k", fetchImpl })).status, 405);
  assert.equal((await handleTranscribe(req({ headers: { "content-type": "audio/mp4" } }), { apiKey: "x", passcode: "k", fetchImpl })).status, 401);
  assert.equal((await handleTranscribe(req(), { apiKey: "", passcode: "k", fetchImpl })).status, 503);
  assert.equal((await handleTranscribe(req({ headers: { "content-type": "video/avi", "x-passcode": "k" } }), { apiKey: "x", passcode: "k", fetchImpl })).status, 415);
  assert.equal((await handleTranscribe(req({ body: Buffer.alloc(0) }), { apiKey: "x", passcode: "k", fetchImpl })).status, 400);
  assert.equal((await handleTranscribe(req({ body: Buffer.alloc(MAX_AUDIO + 1) }), { apiKey: "x", passcode: "k", fetchImpl })).status, 413);
});

test("transcribe: sends Polish, model and file; returns trimmed text", async () => {
  let sent;
  const fetchImpl = async (url, opts) => {
    sent = { url, opts };
    return new Response(JSON.stringify({ text: "  Dzielimy się opłatkiem.  " }), { status: 200 });
  };
  const out = await handleTranscribe(req(), { apiKey: "sk-test", passcode: "k", fetchImpl });
  assert.equal(out.status, 200);
  assert.equal(out.json.text, "Dzielimy się opłatkiem.");
  assert.match(sent.url, /audio\/transcriptions$/);
  assert.equal(sent.opts.headers.Authorization, "Bearer sk-test");
  assert.equal(sent.opts.body.get("language"), "pl");
  assert.equal(sent.opts.body.get("model"), STT_MODEL);
  assert.equal(sent.opts.body.get("file").name, "nagranie.m4a");
});

test("transcribe: upstream failure maps to 502", async () => {
  const orig = console.error; console.error = () => {};
  try {
    const bad = async () => new Response("{}", { status: 500 });
    assert.equal((await handleTranscribe(req(), { apiKey: "x", passcode: "k", fetchImpl: bad })).status, 502);
    const boom = async () => { throw new Error("net"); };
    assert.equal((await handleTranscribe(req(), { apiKey: "x", passcode: "k", fetchImpl: boom })).status, 502);
  } finally { console.error = orig; }
});
