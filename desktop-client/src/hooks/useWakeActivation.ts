import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { tauriBridge } from "../services/tauriBridge";
import { voiceCaptureGate } from "../services/voiceCaptureGate";
import { wakeListener } from "../services/wakeListener";
import type { VoiceProfile } from "../types/voice";

export function useWakeActivation(options: {
  enabled: boolean;
  phrase: string;
  profiles: VoiceProfile[];
  unavailable: boolean;
  onWake: (id: number, text: string, cancelled: () => boolean) => Promise<void>;
}) {
  const [status, setStatus] = useState("Desactivado");
  const [blocked, setBlocked] = useState(voiceCaptureGate.isBlocked());
  const [paused, setPaused] = useState(true);
  const callback = useRef(options.onWake);
  callback.current = options.onWake;
  const identities = JSON.stringify(options.profiles.map(profile => ({ id: Number(profile.id), name: profile.name })));

  useEffect(() => voiceCaptureGate.subscribe(setBlocked), []);
  useEffect(() => {
    if (!tauriBridge.isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void tauriBridge.getDesktopSettings().then(settings => { if (!disposed) setPaused(settings.paused); })
      .catch(error => { if (!disposed) { setPaused(true); setStatus(`Error de escucha: ${String(error)}`); } });
    void listen<{ paused: boolean }>("voice-paused", event => setPaused(event.payload.paused))
      .then(stop => { if (disposed) stop(); else unlisten = stop; })
      .catch(error => { if (!disposed) { setPaused(true); setStatus(`Error de escucha: ${String(error)}`); } });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!options.enabled || !tauriBridge.isTauri()) { setStatus("Desactivado"); return; }
    if (options.unavailable || blocked || paused) { setStatus("En pausa"); return; }
    const characters = JSON.parse(identities) as Array<{ id: number; name: string }>;
    if (!characters.length) { setStatus("Añade un personaje"); return; }
    let disposed = false;
    void wakeListener.start({
      phrase: options.phrase, characters,
      onStatus: value => { if (!disposed) setStatus(value); },
      onError: value => { if (!disposed) setStatus(`Error de escucha: ${value}`); },
      onDetected: async (id, text) => {
        if (!disposed) {
          try { await callback.current(id, text, () => disposed); }
          catch (error) { if (!disposed) setStatus(`No se pudo activar: ${String(error)}`); }
        }
      },
    }).catch(error => { if (!disposed) setStatus(`No se pudo escuchar: ${String(error)}`); });
    return () => { disposed = true; void wakeListener.stop().catch(error => console.warn("No se pudo detener la activación:", error)); };
  }, [options.enabled, options.phrase, identities, options.unavailable, blocked, paused]);

  return status;
}
