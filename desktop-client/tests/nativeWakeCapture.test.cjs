const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function recorderHarness() {
  let handler;
  let starts = 0;
  let stops = 0;
  const sent = [];
  const dependencies = {
    "@tauri-apps/api/event": { listen: async (_, listener) => { handler = listener; return () => {}; } },
    "./voiceCaptureGate": { voiceCaptureGate: { isBlocked: () => false, subscribe: callback => { callback(false); return () => {}; } } },
    "./inferenceSocketService": { inferenceSocketService: {
      sendAudioChunk: audio => sent.push(audio), sendEndOfSpeech: () => sent.push("end"), discardCapturedAudio: () => sent.push("discard"),
    } },
    "./tauriBridge": { tauriBridge: {
      isTauri: () => true, startVoiceCapture: async () => { starts++; }, stopVoiceCapture: async () => { stops++; },
    } },
  };
  const source = readFileSync(resolve(__dirname, "../src/services/nativeAudioRecorder.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(compiled.outputText, { exports, require: name => dependencies[name] });
  return {
    recorder: exports.nativeAudioRecorder,
    feed: samples => handler({ payload: samples }),
    sent,
    counts: () => ({ starts, stops }),
  };
}

test("wake capture feeds only the detector, never the conversation socket", async () => {
  const { recorder, feed, sent } = recorderHarness();
  let detections = 0;
  await recorder.startWake(() => { detections++; });
  feed(Array(2048).fill(4000));
  assert.equal(detections, 1);
  assert.equal(sent.length, 0);
  await recorder.stopWake();
  assert.equal(sent.length, 0);
});

test("switching to conversation stops wake capture and a late wake cleanup cannot stop it", async () => {
  const { recorder, feed, sent, counts } = recorderHarness();
  await recorder.startWake(() => {});
  await recorder.start();
  await recorder.stopWake();
  assert.deepEqual(counts(), { starts: 2, stops: 1 });
  feed(Array(2048).fill(4000));
  assert.equal(sent.length, 1);
  await recorder.stop();
  assert.equal(sent.at(-1), "end");
});

test("stopping silent capture discards it without creating an empty voice turn", async () => {
  const { recorder, feed, sent } = recorderHarness();
  await recorder.start();
  feed(Array(2048).fill(0));
  await recorder.stop();
  assert.equal(sent.at(-1), "discard");
  assert.ok(!sent.includes("end"));
});

test("automatic capture allows a breath and ends only after two seconds of silence", async () => {
  const { recorder, feed, sent } = recorderHarness();
  await recorder.start();
  feed(Array(2048).fill(4000));
  for (let frame = 0; frame < 10; frame++) feed(Array(2048).fill(0));
  assert.ok(!sent.includes("end"));
  feed(Array(2048).fill(4000));
  for (let frame = 0; frame < 15; frame++) feed(Array(2048).fill(0));
  assert.ok(!sent.includes("end"));
  feed(Array(2048).fill(0));
  assert.equal(sent.filter(item => item === "end").length, 1);
  await recorder.stop();
});

test("hold-to-talk commits only when released, even through long breathing pauses", async () => {
  const { recorder, feed, sent } = recorderHarness();
  await recorder.start(undefined, false);
  feed(Array(2048).fill(4000));
  for (let frame = 0; frame < 30; frame++) feed(Array(2048).fill(0));
  assert.ok(!sent.includes("end"));
  feed(Array(2048).fill(4000));
  await recorder.stop();
  assert.equal(sent.filter(item => item === "end").length, 1);
});
