const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { runInNewContext } = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const source = readFileSync(resolve(__dirname, "../src/lib/keyboardShortcut.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const shortcuts = {};
runInNewContext(compiled.outputText, { exports: shortcuts });

function keyEvent(key, code, modifiers = {}) {
  return { key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers };
}

test("captures Ctrl then J as Ctrl+J using the physical key", () => {
  assert.equal(shortcuts.shortcutFromEvent(keyEvent("Control", "ControlLeft", { ctrlKey: true })), null);
  assert.equal(shortcuts.shortcutFromEvent(keyEvent("j", "KeyJ", { ctrlKey: true })), "Ctrl+J");
  assert.equal(shortcuts.shortcutFromEvent(keyEvent("x", "KeyJ", { ctrlKey: true })), "Ctrl+J");
});

test("supports multiple modifiers, space and standalone function keys", () => {
  assert.equal(shortcuts.shortcutFromEvent(keyEvent(" ", "Space", { ctrlKey: true, altKey: true })), "Ctrl+Alt+Space");
  assert.equal(shortcuts.shortcutFromEvent(keyEvent("J", "KeyJ", { shiftKey: true, ctrlKey: true })), "Ctrl+Shift+J");
  assert.equal(shortcuts.shortcutFromEvent(keyEvent("F8", "F8")), "F8");
  assert.equal(shortcuts.shortcutKeyLabel("Super"), "Win");
});

test("does not save bare letters, incomplete modifiers or cancel/navigation keys", () => {
  for (const [key, code] of [["j", "KeyJ"], ["Control", "ControlLeft"], ["Escape", "Escape"], ["Tab", "Tab"]]) {
    assert.equal(shortcuts.shortcutFromEvent(keyEvent(key, code)), null);
  }
});
