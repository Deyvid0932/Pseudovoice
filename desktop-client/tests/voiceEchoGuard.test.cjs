const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadService(name, globals = {}, dependencies = {}) {
  const source = readFileSync(resolve(__dirname, "../src/services", name), "utf8")
    .replaceAll("import.meta.env", "({})");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(compiled.outputText, {
    exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    console,
    setTimeout,
    clearTimeout,
    ArrayBuffer,
    Uint8Array,
    Int16Array,
    ...globals,
  });
  return exports;
}

function createGate() {
  const timers = new Map();
  let sequence = 0;
  const { voiceCaptureGate: gate } = loadService("voiceCaptureGate.ts", {
    setTimeout: callback => { timers.set(++sequence, callback); return sequence; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    gate,
    finishCooldown: () => {
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    },
  };
}

test("capture resumes only after every playback/turn owner and the echo cooldown", () => {
  const { gate, finishCooldown } = createGate();
  gate.block("turn");
  gate.block("playback");
  gate.release("turn");
  finishCooldown();
  assert.equal(gate.isBlocked(), true);
  gate.release("playback");
  assert.equal(gate.isBlocked(), true);
  gate.block("next-playback");
  finishCooldown();
  assert.equal(gate.isBlocked(), true);
  gate.release("next-playback");
  finishCooldown();
  assert.equal(gate.isBlocked(), false);
});

test("PCM playback waits for queued sources and reset stops scheduled audio", () => {
  const { gate, finishCooldown } = createGate();
  const sources = [];
  class AudioContext {
    currentTime = 0;
    state = "running";
    destination = {};
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    createBuffer(_, length, rate) { return { duration: length / rate, copyToChannel() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() {}, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    }
  }
  const { pcmPlayer } = loadService("pcmPlayer.ts", { window: { AudioContext } }, {
    "./voiceCaptureGate": { voiceCaptureGate: gate },
  });
  pcmPlayer.playChunk(new Float32Array(2400));
  pcmPlayer.playChunk(new Float32Array(2400));
  sources[0].onended();
  finishCooldown();
  assert.equal(gate.isBlocked(), true);
  sources[1].onended();
  finishCooldown();
  assert.equal(gate.isBlocked(), false);
  pcmPlayer.playChunk(new Float32Array(2400));
  pcmPlayer.reset();
  assert.equal(sources[2].stopped, true);
  finishCooldown();
  assert.equal(gate.isBlocked(), false);
});

test("worklet discards echo and partial samples before listening resumes", () => {
  const messages = [];
  let Processor;
  runInNewContext(readFileSync(resolve(__dirname, "../src/services/pcmCaptureProcessor.js"), "utf8"), {
    AudioWorkletProcessor: class {
      port = { postMessage: message => messages.push(message) };
    },
    registerProcessor: (_, constructor) => { Processor = constructor; },
  });
  const processor = new Processor({ processorOptions: { chunkSize: 128 } });
  const process = (value, count = 128) => processor.process([[new Float32Array(count).fill(value)]], [[]]);
  process(0.7, 64);
  processor.port.onmessage({ data: { type: "capture-suppressed", suppressed: true } });
  process(0.7);
  assert.equal(messages.length, 0);
  processor.port.onmessage({ data: { type: "capture-suppressed", suppressed: false } });
  process(0.2);
  const samples = new Int16Array(messages[0].pcm);
  assert.equal(samples.length, 128);
  assert.ok([...samples].every(sample => sample > 6500 && sample < 6600));
});

test("socket blocks echo turns and discards partial capture during playback", () => {
  const { gate, finishCooldown } = createGate();
  let socket;
  class WebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = 1;
    sent = [];
    constructor() { socket = this; }
    send(data) { this.sent.push(data); }
    close() { this.readyState = 3; }
  }
  const { inferenceSocketService: service } = loadService("inferenceSocketService.ts", { WebSocket }, {
    "./voiceCaptureGate": { voiceCaptureGate: gate },
    "./pcmPlayer": { pcmPlayer: { reset() {}, feedBinaryChunk() {} } },
    "../lib/authStorage": { readAccessToken: () => "test" },
    "./tauriBridge": { tauriBridge: { isTauri: () => false } },
  });
  service.connect();
  socket.onopen();
  service.sendSessionConfig({ character_id: 1, character_rules: [], reference_audio_name: "fish:test" }, 4);
  socket.onmessage({ data: JSON.stringify({ type: "session_ready" }) });
  service.sendAudioChunk(new ArrayBuffer(8));
  service.sendEndOfSpeech();
  const submitted = socket.sent.length;
  service.sendAudioChunk(new ArrayBuffer(8));
  service.sendEndOfSpeech();
  assert.equal(socket.sent.length, submitted);
  gate.block("pcm-playback");
  socket.onmessage({ data: JSON.stringify({ type: "turn_complete" }) });
  finishCooldown();
  assert.equal(gate.isBlocked(), true);
  gate.release("pcm-playback");
  finishCooldown();
  service.prepareSessionSwitch();
  service.sendSessionConfig({ character_id: 2, character_rules: [], reference_audio_name: "fish:other" }, 5);
  const beforeSwitch = socket.sent.length;
  service.sendAudioChunk(new ArrayBuffer(8));
  socket.onmessage({ data: JSON.stringify({ type: "session_ready", character_id: 1, conversation_id: 4 }) });
  finishCooldown();
  service.sendAudioChunk(new ArrayBuffer(8));
  assert.equal(socket.sent.length, beforeSwitch);
  socket.onmessage({ data: JSON.stringify({ type: "session_ready", character_id: 2, conversation_id: 5 }) });
  finishCooldown();
  assert.equal(service.isSessionReadyForCharacter(2), true);
  service.sendAudioChunk(new ArrayBuffer(8));
  gate.block("saved-audio");
  assert.equal(JSON.parse(socket.sent.at(-1)).type, "discard_audio");
  const beforeEcho = socket.sent.length;
  service.sendAudioChunk(new ArrayBuffer(8));
  service.sendEndOfSpeech();
  assert.equal(socket.sent.length, beforeEcho);
  service.disconnect();
});
