import { useEffect, useRef, useState } from "react";
import { shortcutFromEvent, shortcutKeyLabel, shortcutModifiers } from "../lib/keyboardShortcut";
import { tauriBridge } from "../services/tauriBridge";

interface Props {
  value: string;
  disabled?: boolean;
  onSave: (shortcut: string) => Promise<void>;
}

export function ShortcutRecorder({ value, disabled = false, onSave }: Props) {
  const [draft, setDraft] = useState(value);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  const capturing = useRef(false);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      capturing.current = false;
      void tauriBridge.setShortcutRecording(false).catch(error => console.warn("No se pudo restaurar el atajo:", error));
    };
  }, []);

  async function finishCapture(combination?: string) {
    if (!capturing.current) return;
    capturing.current = false;
    setRecording(false);
    setPreview([]);
    if (combination) setDraft(combination);
    setBusy(true);
    try { await tauriBridge.setShortcutRecording(false); }
    catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === "Escape" || event.key === "Tab") { void finishCapture(); return; }
      setPreview(shortcutModifiers(event));
      const combination = shortcutFromEvent(event);
      if (combination) { setError(""); void finishCapture(combination); }
      else if (!["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(event.key)) {
        setError("Combina Ctrl, Alt, Shift o Win con otra tecla; también puedes usar F1–F24.");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      setPreview(shortcutModifiers(event));
    };
    const cancel = () => { void finishCapture(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancel);
    };
  }, [recording]);

  async function startCapture() {
    setBusy(true); setError(""); setSaved(false);
    try {
      await tauriBridge.setShortcutRecording(true);
      if (!mounted.current) { await tauriBridge.setShortcutRecording(false); return; }
      capturing.current = true;
      setRecording(true);
      setPreview([]);
    } catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try { await onSave(draft); if (mounted.current) setSaved(true); }
    catch (reason) { if (mounted.current) setError(String(reason)); }
    finally { if (mounted.current) setBusy(false); }
  }

  const keys = recording ? preview : draft.split("+");
  return <div className="pv-shortcut-editor">
    <div className="pv-shortcut-heading"><strong>Atajo de voz</strong><span>Mantener presionado</span></div>
    <button type="button" className={`pv-shortcut-capture${recording ? " is-recording" : ""}`} aria-label={recording ? "Cancelar captura del atajo" : "Cambiar combinación del atajo de voz"} aria-pressed={recording} disabled={disabled || busy} onClick={() => recording ? void finishCapture() : void startCapture()}>
      <span className="pv-shortcut-keycaps">{keys.map((key, index) => <span className="pv-shortcut-key" key={key}>{index > 0 && <span aria-hidden="true">+</span>}<kbd>{shortcutKeyLabel(key)}</kbd></span>)}{recording && <span className="pv-shortcut-placeholder">{keys.length ? "+ otra tecla" : "Presiona una combinación…"}</span>}</span>
      <span className="pv-shortcut-action">{busy ? "Espera…" : recording ? "Cancelar" : "Cambiar"}</span>
    </button>
    <p className="pv-shortcut-help">{recording ? "Mantén Ctrl y presiona J, por ejemplo. Esc para cancelar." : "Pulsa Cambiar y presiona las teclas que quieres usar."}</p>
    <div className="pv-shortcut-footer"><button type="button" disabled={disabled || busy || recording} onClick={() => { setDraft("Ctrl+Alt+Space"); setSaved(false); setError(""); }}>Restablecer</button><button type="button" className="pv-primary" disabled={disabled || busy || recording || draft === value} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar atajo"}</button></div>
    <span className={`pv-shortcut-feedback${error ? " pv-error" : ""}`} role="status">{error || (saved ? "Atajo actualizado" : draft !== value ? "Cambio pendiente de guardar" : "")}</span>
  </div>;
}
