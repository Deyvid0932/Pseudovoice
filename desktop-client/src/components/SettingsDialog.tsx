import { useEffect, useRef, useState } from "react";
import { tauriBridge } from "../services/tauriBridge";
import { ShortcutRecorder } from "./ShortcutRecorder";
import type {
  AudioFormat,
  EngineState,
  SessionOperator,
} from "../types/voice";
import { cn } from "../lib/format";
import {
  HeadphonesIcon,
  LockIcon,
  PowerIcon,
  SlidersIcon,
  TerminalIcon,
  XIcon,
} from "./ui/icons";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  operator: SessionOperator;
  build: string;
  audioFormat: AudioFormat;
  engineState: EngineState;
  characterName: string | null;
  onToggleMic: () => void;
  onReconnect: () => void;
  onOpenLogs: () => void;
  backgroundEnabled: boolean;
  shortcut: string;
  wakeEnabled?: boolean;
  wakePhrase?: string;
  wakeStatus?: string;
  onWakeEnabledChange?: (enabled: boolean) => void;
  onWakePhraseChange?: (phrase: string) => void;
  pcControlEnabled: boolean;
  saveResponseAudio: boolean;
  onSaveResponseAudioChange: (enabled: boolean) => void;
  onBackgroundChange: (enabled: boolean) => Promise<void>;
  onShortcutChange: (shortcut: string) => Promise<void>;
  onPcControlChange: (enabled: boolean) => Promise<void>;
}

export function SettingsDialog({
  open,
  onClose,
  operator,
  build,
  audioFormat,
  engineState,
  characterName,
  onToggleMic,
  onReconnect,
  onOpenLogs,
  backgroundEnabled, shortcut, pcControlEnabled,
  onBackgroundChange, onShortcutChange, onPcControlChange,
}: SettingsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function apply(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError(String(reason)); } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const connected = engineState === "OK";

  const actions = [
    {
      label: "Alternar micrófono",
      hint: "Focus mode",
      Icon: HeadphonesIcon,
      onClick: onToggleMic,
    },
    {
      label: "Reconectar motor de IA",
      hint: connected ? "En línea" : "Reintentar",
      Icon: PowerIcon,
      onClick: onReconnect,
    },
    {
      label: "Abrir logs y telemetría",
      hint: "Observability",
      Icon: TerminalIcon,
      onClick: onOpenLogs,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Cerrar configuración"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-zinc-950/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="suite-settings-title"
        className="pv-settings animate-pv-rise relative w-full max-w-md overflow-y-auto max-h-[90vh] rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/70"
      >
        <div className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
              <SlidersIcon size={16} />
            </span>
            <div>
              <h2
                id="suite-settings-title"
                className="text-sm font-bold text-zinc-100"
              >
                Configuración del suite
              </h2>
              <p className="text-[11px] text-zinc-500">
                Runtime de voz · {characterName ?? "sin personaje"}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <XIcon size={15} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="pv-form">
            <label className="pv-check"><input type="checkbox" checked={backgroundEnabled} disabled={busy || !tauriBridge.isTauri()} onChange={event => void apply(() => onBackgroundChange(event.target.checked))} />Continuar en segundo plano al cerrar</label>
            <ShortcutRecorder value={shortcut} disabled={busy || !tauriBridge.isTauri()} onSave={onShortcutChange} />
            <label className="pv-check"><input type="checkbox" checked={pcControlEnabled} disabled={busy || !tauriBridge.isTauri()} onChange={event => void apply(() => onPcControlChange(event.target.checked))} />Permitir control del PC en esta sesión</label>
            <p className="pv-muted">Desactivado al iniciar. Abrir y cerrar aplicaciones requiere aprobación explícita.</p>
            {!tauriBridge.isTauri() && <p className="pv-muted">Segundo plano, atajo global y control del PC están disponibles en la app de escritorio.</p>}
            {error && <p className="pv-error" role="alert">{error}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-3">
            {[
              { label: "Operador", value: operator.displayName },
              { label: "Acceso", value: operator.accessLevel },
              {
                label: "Sample rate",
                value: `${audioFormat.sampleRate / 1000} kHz`,
              },
              { label: "Depth", value: `${audioFormat.bitDepth} bit` },
              { label: "Build", value: build },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2"
              >
                <dt className="pv-kicker text-zinc-600">{row.label}</dt>
                <dd className="pv-mono mt-1 truncate text-xs text-zinc-200">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2.5",
              connected
                ? "border-teal-500/25 bg-teal-500/[0.06]"
                : "border-amber-500/25 bg-amber-500/[0.06]",
            )}
          >
            <LockIcon size={14} className="text-teal-400" />
            <p className="text-[11px] leading-relaxed text-zinc-300">
              {connected
                ? "Transporte cifrado activo con el motor de inferencia."
                : "Sin conexión: trabajando con caché local hasta reconectar."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-800 px-3.5 py-2.5 text-left text-xs text-zinc-300 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2.5">
                  <action.Icon size={14} className="text-teal-400" />
                  {action.label}
                </span>
                <span className="pv-kicker text-zinc-600">{action.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
