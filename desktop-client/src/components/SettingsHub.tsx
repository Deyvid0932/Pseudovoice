import { useEffect, useRef, useState } from "react";
import { tauriBridge } from "../services/tauriBridge";
import type { Theme } from "../lib/preferences";
import type { SettingsDialogProps } from "./SettingsDialog";
import { Avatar } from "./ui/Avatar";
import { CheckIcon, GearIcon, LayersIcon, MicIcon, ShieldIcon, SlidersIcon, TerminalIcon, UserRoundIcon, XIcon } from "./ui/icons";
import { MemoryPanel } from "./MemoryPanel";
import { AgentSettingsPanel } from "./AgentSettingsPanel";
import type { VoiceProfile } from "../types/voice";
import { ShortcutRecorder } from "./ShortcutRecorder";

export type SettingsSection = "profile" | "personalization" | "desktop" | "pc" | "diagnostics" | "memory";
interface Props extends SettingsDialogProps {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  identity: { fullName: string; email: string; avatarUrl: string | null };
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  profiles: VoiceProfile[];
  characterId: number | null;
  memoryRevision: number;
}
const sections = [
  { id: "profile", label: "Perfil", Icon: UserRoundIcon },
  { id: "personalization", label: "Personalización", Icon: SlidersIcon },
  { id: "desktop", label: "Voz y escritorio", Icon: MicIcon },
  { id: "pc", label: "Control del PC y automatizaciones", Icon: ShieldIcon },
  { id: "memory", label: "Memoria", Icon: LayersIcon },
  { id: "diagnostics", label: "Diagnóstico", Icon: TerminalIcon },
] as const;

export function SettingsHub(props: Props) {
  const { open, section, onSectionChange, onClose, identity, theme, onThemeChange, shortcut, profiles, characterId, memoryRevision } = props;
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wakeDraft, setWakeDraft] = useState(props.wakePhrase ?? "Oye");
  useEffect(() => { setWakeDraft(props.wakePhrase ?? "Oye"); }, [props.wakePhrase]);
  const native = tauriBridge.isTauri();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>(".pv-profile-trigger")?.focus();
    };
  }, [open, onClose]);
  async function apply(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(false); }
  }
  if (!open) return null;
  return <div className="pv-overlay pv-settings-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="pv-settings-hub" role="dialog" aria-modal="true" aria-labelledby="pv-settings-title">
      <header className="pv-settings-heading"><h2 id="pv-settings-title"><GearIcon size={23} />Configuración</h2><button ref={closeRef} type="button" aria-label="Cerrar configuración" onClick={onClose}><XIcon size={22} /></button></header>
      <div className="pv-settings-body">
        <nav className="pv-settings-nav" aria-label="Secciones de configuración">{sections.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={section === id ? "page" : undefined} onClick={() => onSectionChange(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
        <div className="pv-settings-content">
          <h3>{sections.find(item => item.id === section)!.label}</h3>
          <p className="pv-settings-intro">{section === "personalization" ? "Haz que PseudoVoice se sienta a tu manera." : section === "profile" ? "Tu espacio personal en PseudoVoice." : section === "desktop" ? "Configura cómo conversas desde el escritorio." : section === "pc" ? "Permisos, límites y tareas del motor de automatización." : section === "memory" ? "Decide cómo se guardan y comparten los recuerdos." : "Consulta el estado de tus servicios y herramientas avanzadas."}</p>
          {section === "profile" && <div className="pv-settings-profile"><Avatar seed={`user-${identity.fullName}`} label={identity.fullName} imageUrl={identity.avatarUrl} size={80} roundedClassName="rounded-full" /><div><strong>{identity.fullName}</strong><p>{identity.email}</p></div></div>}
          {section === "personalization" && <div className="pv-settings-block"><h4>Apariencia</h4><p>Elige el tema de la aplicación.</p><div className="pv-theme-cards" role="group" aria-label="Tema de la aplicación">{(["light", "dark"] as const).map(value => <button key={value} type="button" className={`pv-theme-card${theme === value ? " is-selected" : ""}`} aria-pressed={theme === value} onClick={() => onThemeChange(value)}><span className="pv-theme-card-check">{theme === value ? <CheckIcon size={15} /> : <span />}</span><span className={`pv-theme-mini pv-theme-mini-${value}`} aria-hidden="true"><span className="pv-theme-mini-sidebar"><i /><i /><i /><i /></span><span className="pv-theme-mini-chat"><i /><i /><i /><b /></span></span><strong>{value === "light" ? "Claro" : "Oscuro"}</strong></button>)}</div><p className="pv-theme-saved">Tu preferencia se guarda automáticamente.</p></div>}
          {section === "desktop" && <div className="pv-settings-block pv-form">
            <label className="pv-settings-toggle"><span><strong>Guardar audio de respuestas</strong><small>Guarda WAV en este dispositivo para reproducir después. Aproximadamente 2,9 MB por minuto; al eliminar un chat se intenta borrar su audio local. Desactivarlo no elimina lo ya guardado. Los archivos no se suben al servidor.</small></span><input type="checkbox" role="switch" checked={props.saveResponseAudio} disabled={!native} onChange={event => props.onSaveResponseAudioChange(event.target.checked)} /></label>
            <label className="pv-settings-toggle"><span><strong>Continuar en segundo plano</strong><small>Mantener la aplicación activa al cerrar la ventana.</small></span><input type="checkbox" role="switch" checked={props.backgroundEnabled} disabled={busy || !native} onChange={event => void apply(() => props.onBackgroundChange(event.target.checked))} /></label>
            <ShortcutRecorder value={shortcut} disabled={busy || !native} onSave={props.onShortcutChange} />
            <label className="pv-settings-toggle"><span><strong>Activación por voz</strong><small>Desactivada por defecto. Escucha fragmentos cortos con Whisper en este PC, sin consultar a la IA hasta reconocer la frase y el nombre. Consume CPU cuando hay voz y requiere que la app siga abierta.</small></span><input type="checkbox" role="switch" checked={props.wakeEnabled ?? false} disabled={!native} onChange={event => props.onWakeEnabledChange?.(event.target.checked)} /></label>
            <label>Frase de activación<input value={wakeDraft} maxLength={40} disabled={!native} placeholder="Oye" onChange={event => setWakeDraft(event.target.value)} /></label>
            <button type="button" className="pv-primary" disabled={!native || wakeDraft.trim().length < 2 || !/^[\p{L}\p{N}\s]+$/u.test(wakeDraft.trim()) || wakeDraft.trim() === props.wakePhrase} onClick={() => props.onWakePhraseChange?.(wakeDraft.trim().replace(/\s+/g, " "))}>Guardar frase</button>
            <p className="pv-muted">{profiles.slice(0, 4).map(profile => `«${props.wakePhrase ?? "Oye"} ${profile.name}»`).join(" · ") || "Añade un personaje para usar la activación."}</p>
            <p className="pv-muted" role="status">{props.wakeEnabled ? "La escucha de activación se pausa al abrir Configuración, usar el micrófono o reproducir audio. Se reanuda al terminar." : "Activación desactivada. El atajo de teclado sigue disponible."} {props.wakeEnabled && props.wakeStatus?.startsWith("Error") ? props.wakeStatus : ""}</p>
            <button type="button" onClick={() => { props.onToggleMic(); onClose(); }}>Alternar micrófono</button>
          </div>}
          {section === "pc" && <AgentSettingsPanel pcControlEnabled={props.pcControlEnabled} onPcControlChange={props.onPcControlChange} />}
          {section === "memory" && <MemoryPanel profiles={profiles} characterId={characterId} characterName={profiles.find(profile => Number(profile.id) === characterId)?.name} refreshKey={memoryRevision} />}
          {(section === "desktop" || section === "pc") && !native && <p className="pv-settings-native-note">El guardado de audio, segundo plano, atajos globales y control del PC están disponibles en la app de escritorio.</p>}
          {section === "diagnostics" && <div className="pv-settings-block"><dl className="pv-settings-diagnostics">{[{ label: "Motor", value: props.engineState === "OK" ? "Conectado" : props.engineState === "OFFLINE" ? "Desconectado" : "Preparando" }, { label: "Personaje", value: props.characterName ?? "Sin personaje" }, { label: "Operador", value: props.operator.displayName }, { label: "Acceso", value: props.operator.accessLevel }, { label: "Audio", value: `${props.audioFormat.sampleRate / 1000} kHz · ${props.audioFormat.bitDepth} bit` }, { label: "Versión", value: props.build }].map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl><div className="pv-settings-diagnostic-actions"><button type="button" onClick={props.onReconnect}>Reconectar motor</button><button type="button" onClick={() => { props.onOpenLogs(); onClose(); }}>Abrir logs, telemetría y exportación</button></div></div>}
          {error && <p className="pv-error" role="alert">No se pudo guardar: {error}. Puedes reintentar; tus cambios siguen en el editor.</p>}
        </div>
      </div>
      <footer className="pv-settings-footer"><button type="button" className="pv-primary" onClick={onClose}>Listo</button></footer>
    </section>
  </div>;
}
