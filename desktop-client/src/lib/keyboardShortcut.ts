type ShortcutEvent = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

export function shortcutModifiers(event: ShortcutEvent): string[] {
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Super"]
    .filter((value): value is string => Boolean(value));
}

export function shortcutFromEvent(event: ShortcutEvent): string | null {
  if (["Control", "Alt", "Shift", "Meta", "AltGraph", "Escape"].includes(event.key)) return null;
  const modifiers = shortcutModifiers(event);
  const code = event.code;
  const functionKey = /^F([1-9]|1\d|2[0-4])$/.test(code);
  if (!modifiers.length && !functionKey) return null;
  let key: string;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (functionKey || /^(Space|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Numpad[0-9]|NumpadAdd|NumpadSubtract|NumpadMultiply|NumpadDivide|NumpadDecimal)$/.test(code)) key = code;
  else return null;
  return [...modifiers, key].join("+");
}

export function shortcutKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    Super: "Win", Control: "Ctrl", Space: "Espacio", ArrowUp: "↑", ArrowDown: "↓",
    ArrowLeft: "←", ArrowRight: "→", Backspace: "Retroceso", Delete: "Supr",
  };
  return labels[key] ?? key.replace(/^Key|^Digit/, "");
}
