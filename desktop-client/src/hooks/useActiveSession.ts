import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AudioFormat,
  EngineState,
  FocusStatus,
  SessionOperator,
  TranscriptLine,
} from "../types/voice";
import { formatClock } from "../lib/format";
import { inferenceSocketService } from "../services/inferenceSocketService";
import { aiInferenceService } from "../services/aiInferenceService";
import { pcmPlayer } from "../services/pcmPlayer";
import { voiceCaptureGate } from "../services/voiceCaptureGate";
import { nativeAudioRecorder } from "../services/nativeAudioRecorder";
import { sessionService } from "../services/sessionService";
import { tauriBridge } from "../services/tauriBridge";
import { listen } from "@tauri-apps/api/event";
import type { NotifyInput } from "./useToasts";

export const SESSION_BARS = 40;
export const SESSION_ID = "PVE-230919-DL1";

const OPERATOR: SessionOperator = {
  id: "user-1",
  displayName: "Deyvi_01",
  role: "Operator",
  accessLevel: "Root access",
  avatarSeed: "deyvi-operator-root-01",
  palette: ["#34d399", "#0d9488"],
};

const AUDIO_FORMAT: AudioFormat = { sampleRate: 16000, bitDepth: 16 };
const INITIAL_ELAPSED_SECONDS = 0;

export interface UseActiveSessionOptions {
  userId?: number;
  onNotify?: (input: NotifyInput) => void;
  active?: boolean;
  pcControlEnabled?: boolean;
}

export interface UseActiveSessionResult {
  operator: SessionOperator;
  sessionId: string;
  engineState: EngineState;
  isLive: boolean;
  status: FocusStatus;
  statusLabel: string;
  latencyMs: number;
  audioFormat: AudioFormat;
  elapsedSeconds: number;
  elapsedLabel: string;
  levels: number[];
  transcript: TranscriptLine[];
  isProcessing: boolean;
  clearTranscript: () => void;
  loadConversationTranscript: (lines: TranscriptLine[], characterName: string) => void;
  switchCount: number;
  lastTranscript: string | null;
  memoryRevision: number;
  needsVoiceReassignment: boolean;
  conversationAccessIssue: boolean;
  sendText: (text: string) => Promise<void>;
  commitProfileSwitch: (
    characterIdOrName?: number | string,
    profileName?: string,
    rules?: unknown[],
  ) => Promise<void>;
  toggleMic: () => Promise<void>;
  activateFromWake: (text?: string) => Promise<void>;
  pulse: (strength?: number) => void;
}

function createLevels(): number[] {
  return Array.from({ length: SESSION_BARS }, (_, index) =>
    0.12 + Math.abs(Math.sin(index * 0.7)) * 0.4,
  );
}

function advanceLevels(previous: number[], live: boolean): number[] {
  const now = performance.now();
  return previous.map((value, index) => {
    const goal = live
      ? Math.min(
        1,
        Math.abs(Math.sin(now / 620 + index * 0.42)) * 0.52 +
        0.06 +
        Math.random() * 0.4,
      )
      : 0.06;
    return value + (goal - value) * 0.5;
  });
}

export function useActiveSession(
  options: UseActiveSessionOptions = {},
): UseActiveSessionResult {
  const { userId = 1, onNotify, active = true, pcControlEnabled = false } = options;
  const pcControlRef = useRef(pcControlEnabled);
  pcControlRef.current = pcControlEnabled;
  const commandBusyRef = useRef(false);
  const micBusyRef = useRef(false);
  const wakeTurnRef = useRef(false);
  const wakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shortcutDesiredRef = useRef<boolean | null>(null);
  const pausedRef = useRef(false);
  const notifyRef = useRef(onNotify);
  useEffect(() => {
    notifyRef.current = onNotify;
  }, [onNotify]);

  const [latencyMs, setLatencyMs] = useState(65);
  const [elapsedSeconds, setElapsedSeconds] = useState(INITIAL_ELAPSED_SECONDS);
  const [levels, setLevels] = useState<number[]>(createLevels);
  const [isLive, setIsLive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [switchCount, setSwitchCount] = useState(0);
  const [engineState, setEngineState] = useState<EngineState>("OFFLINE");
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [needsVoiceReassignment, setNeedsVoiceReassignment] = useState(false);
  const [conversationAccessIssue, setConversationAccessIssue] = useState(false);
  const characterNameRef = useRef("Jev");
  const speakingTimeoutRef = useRef<number | null>(null);
  const speakingUntilRef = useRef(0);

  const liveRef = useRef(isLive);
  useEffect(() => {
    liveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    const playing = new Set<HTMLMediaElement>();
    const onPlay = (event: Event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      playing.add(event.target);
      voiceCaptureGate.block(event.target);
    };
    const onStop = (event: Event) => {
      if (!(event.target instanceof HTMLMediaElement)) return;
      playing.delete(event.target);
      voiceCaptureGate.release(event.target);
    };
    document.addEventListener("play", onPlay, true);
    for (const type of ["pause", "ended", "error", "emptied"]) document.addEventListener(type, onStop, true);
    const observer = new MutationObserver(() => {
      for (const media of playing) {
        if (!media.isConnected) {
          playing.delete(media);
          voiceCaptureGate.release(media);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("play", onPlay, true);
      for (const type of ["pause", "ended", "error", "emptied"]) document.removeEventListener(type, onStop, true);
      for (const media of playing) voiceCaptureGate.release(media);
    };
  }, []);

  // Inference socket lifecycle + event fan-out
  useEffect(() => {
    inferenceSocketService.setEventListeners({
      onSessionReady: () => {
        setEngineState("OK");
        setNeedsVoiceReassignment(false);
        setConversationAccessIssue(false);
      },
      onMemoryProposed: (data) => {
        setMemoryRevision(value => value + 1);
        const automatic = data.mode === "automatic";
        notifyRef.current?.({
          title: automatic ? "Memoria actualizada automáticamente" : "Nueva sugerencia de memoria",
          description: automatic
            ? `${data.created ?? 0} recuerdos guardados y ${data.updated ?? 0} actualizados. Puedes deshacerlos en Actividad.`
            : "Revisa la sugerencia en Memorias antes de aprobarla o descartarla.",
          variant: "info",
        });
      },
      onConnectionChange: (connected) => {
        if (!connected) {
          setEngineState("OFFLINE");
          setIsProcessing(false);
          setIsSpeaking(false);
          if (liveRef.current) {
            liveRef.current = false;
            setIsLive(false);
            void (async () => {
              if (tauriBridge.isTauri()) await nativeAudioRecorder.stop();
              else {
                const { audioRecorder } = await import("../services/audioRecorder");
                await audioRecorder.stop();
              }
            })().catch(error => console.warn("No se pudo detener la captura tras desconectar el motor:", error));
          }
          speakingUntilRef.current = 0;
          if (speakingTimeoutRef.current !== null) window.clearTimeout(speakingTimeoutRef.current);
          speakingTimeoutRef.current = null;
          return;
        }
        setEngineState("DEGRADED");
        void aiInferenceService.checkHealth().then((health) => {
          if (!health.voice_models_ready) setEngineState("DEGRADED");
          if (!health.voice_models_ready) {
            notifyRef.current?.({
              title: "Motor de voz sin modelos",
              description: "El servicio está conectado, pero falta preparar Whisper o el servicio de voz Fish. Revisa el motor de voz.",
              variant: "warning",
            });
          } else if (!health.deepseek_configured) {
            notifyRef.current?.({
              title: "DeepSeek no está configurado",
              description: "El enrutador local responde a saludos y comandos permitidos; las consultas complejas requieren DEEPSEEK_API_KEY.",
              variant: "warning",
            });
          } else if (!health.persistence_backend_configured) {
            notifyRef.current?.({
              title: "Persistencia del backend no conectada",
              description: "Comprueba que Spring está activo en tu PC y que el servicio de voz usa la misma dirección y clave interna.",
              variant: "warning",
            });
          } else if (health.inference_auth_required &&
            (!health.inference_auth_configured || !aiInferenceService.hasAccessKey())) {
            notifyRef.current?.({
              title: "Falta la clave del servicio de voz",
              description: "Reinicia el frontend para cargar la clave de acceso del servicio de voz.",
              variant: "warning",
            });
          }
        }).catch((error) => {
          setEngineState("DEGRADED");
          notifyRef.current?.({
            title: "La URL no corresponde al motor PseudoVoice",
            description: error instanceof Error ? error.message : String(error),
            variant: "warning",
          });
        });
      },
      onAudioChunk: (durationMs) => {
        const now = Date.now();
        speakingUntilRef.current = Math.max(now, speakingUntilRef.current) + durationMs;
        setIsSpeaking(true);
        if (speakingTimeoutRef.current !== null) window.clearTimeout(speakingTimeoutRef.current);
        speakingTimeoutRef.current = window.setTimeout(() => {
          setIsSpeaking(false);
          speakingUntilRef.current = 0;
          speakingTimeoutRef.current = null;
        }, Math.max(0, speakingUntilRef.current - now) + 60);
      },
      onTurnStart: () => {
        setIsProcessing(true);
        if (wakeTurnRef.current) {
          wakeTurnRef.current = false;
          if (wakeTimeoutRef.current !== null) clearTimeout(wakeTimeoutRef.current);
          wakeTimeoutRef.current = null;
          liveRef.current = false;
          setIsLive(false);
          void nativeAudioRecorder.stop().catch(error => console.warn("No se pudo cerrar el turno de activación:", error));
        }
      },
      onTranscript: (data) => {
        setLastTranscript(data.text);
        setTranscript((previous) => [
          ...previous.slice(-199),
          {
            id: `stt-${data.turn_id ?? Date.now().toString(36)}`,
            role: "user",
            speaker: "Tú",
            text: data.text,
          },
        ]);
      },
      onAssistantResponse: (data) => {
        setTranscript((previous) => [
          ...previous.slice(-199),
          { id: `assistant-${data.turn_id}`, role: "assistant", speaker: characterNameRef.current, text: data.text, savedAudioId: data.saved_audio_id },
        ]);
      },
      onPcCommand: (data) => {
        if (!pcControlRef.current || commandBusyRef.current) return;
        const action = data.command.action;
        const asksConfirmation = action === "open_app" || action === "close_app";
        const supported = asksConfirmation || action === "volume_control" || action === "media_control";
        if (!supported) {
          notifyRef.current?.({ title: "Acción no permitida", description: action, variant: "warning" });
          return;
        }
        if (asksConfirmation && !window.confirm(`${action === "open_app" ? "¿Abrir" : "¿Cerrar"} ${data.command.target}?${action === "close_app" ? " Podrías perder cambios sin guardar." : ""}`)) return;
        commandBusyRef.current = true;
        void tauriBridge.executePcCommand(data.command, asksConfirmation)
          .then((result) => notifyRef.current?.({ title: "Comando ejecutado", description: result, variant: "success" }))
          .catch((error) => notifyRef.current?.({ title: "Comando no ejecutado", description: String(error), variant: "warning" }))
          .finally(() => { commandBusyRef.current = false; });
      },
      onAgentTaskStarted: (data) => {
        notifyRef.current?.({ title: "Tarea web iniciada", description: `Ejecución #${data.task_id} añadida a la bandeja global.`, variant: "info" });
      },
      onTurnComplete: (data) => {
        setIsProcessing(false);
        if (data.metrics?.total_turn_latency_ms) {
          setLatencyMs(Math.round(data.metrics.total_turn_latency_ms));
        }
      },
      onError: (err) => {
        setIsProcessing(false);
        if (/fish|reference|referencia|elevenlabs/i.test(err)) setNeedsVoiceReassignment(true);
        if (/no tienes acceso a esta conversación\/personaje/i.test(err)) {
          setConversationAccessIssue(true);
          return;
        }
        const voiceNotDetected = /no se detect[oó] voz|no speech|speech not detected|sin voz inteligible/i.test(err);
        notifyRef.current?.({
          title: voiceNotDetected ? "No pude entender el audio" : "La conversación necesita atención",
          description: voiceNotDetected
            ? "Prueba a acercarte al micrófono, reducir el ruido de fondo y hablar de nuevo."
            : err,
          variant: "warning",
        });
      },
    });

    inferenceSocketService.connect();

    return () => {
      inferenceSocketService.disconnect();
      if (wakeTimeoutRef.current !== null) clearTimeout(wakeTimeoutRef.current);
      if (speakingTimeoutRef.current !== null) window.clearTimeout(speakingTimeoutRef.current);
    };
  }, []);

  // Session clock
  useEffect(() => {
    const clock = window.setInterval(() => {
      setElapsedSeconds((previous) => previous + 1);
    }, 1000);
    return () => window.clearInterval(clock);
  }, []);

  // Base spectrum animation (audioRecorder overrides with real mic data)
  useEffect(() => {
    if (!active) {
      return;
    }
    const spectrum = window.setInterval(() => {
      setLevels((previous) => advanceLevels(previous, liveRef.current));
    }, 120);
    return () => window.clearInterval(spectrum);
  }, [active]);

  const pulse = useCallback((strength = 1) => {
    setLevels((previous) =>
      previous.map((value) =>
        Math.min(1, value + (0.18 + Math.random() * 0.42) * strength),
      ),
    );
  }, []);

  const toggleMic = useCallback(async (holdToTalk = false) => {
    if (micBusyRef.current) return;
    micBusyRef.current = true;
    try {
      if (pausedRef.current && !liveRef.current) return;
      const { audioRecorder } = await import("../services/audioRecorder");

      if (!liveRef.current) {
        if (!inferenceSocketService.isSessionReady()) {
          notifyRef.current?.({
            title: "La sesión todavía no está lista",
            description: "Espera a que conecte el motor y se configure el personaje antes de activar el micrófono.",
            variant: "warning",
          });
          return;
        }
        await pcmPlayer.resume();
        let started = false;
        try {
          started = tauriBridge.isTauri()
            ? await nativeAudioRecorder.start(setLevels, !holdToTalk)
            : await audioRecorder.start(setLevels, !holdToTalk);
        } catch (error) {
          notifyRef.current?.({
            title: "No se pudo iniciar la captura de voz",
            description: String(error),
            variant: "error",
          });
        }
        if (started) {
          liveRef.current = true;
          setIsLive(true);
        } else {
          if (!tauriBridge.isTauri()) {
            notifyRef.current?.({
              title: "Acceso al micrófono requerido",
              description:
                "Habilita los permisos de micrófono para transmitir tu voz al motor de IA.",
              variant: "error",
            });
          }
        }
      } else {
        wakeTurnRef.current = false;
        if (wakeTimeoutRef.current !== null) clearTimeout(wakeTimeoutRef.current);
        wakeTimeoutRef.current = null;
        try {
          if (tauriBridge.isTauri()) await nativeAudioRecorder.stop();
          else {
            const capturedSpeech = await audioRecorder.stop();
            if (!capturedSpeech) {
              notifyRef.current?.({
                title: "No llegó voz del micrófono",
                description: "Habla mientras el micrófono está activo. Si el nivel no reacciona, revisa el micrófono seleccionado y sus permisos en Windows.",
                variant: "warning",
              });
            }
          }
        } catch (error) {
          notifyRef.current?.({
            title: "No se pudo detener la captura nativa",
            description: String(error),
            variant: "warning",
          });
        } finally {
          liveRef.current = false;
          setIsLive(false);
        }
      }
    } finally {
      micBusyRef.current = false;
      const desired = shortcutDesiredRef.current;
      shortcutDesiredRef.current = null;
      if (desired !== null && desired !== liveRef.current) {
        shortcutDesiredRef.current = desired;
        void toggleMic(desired);
      }
    }
  }, []);

  useEffect(() => {
    if (!tauriBridge.isTauri()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void Promise.all([
      listen<{ pressed: boolean }>("voice-shortcut", event => {
        shortcutDesiredRef.current = event.payload.pressed;
        if (event.payload.pressed !== liveRef.current) void toggleMic(event.payload.pressed);
      }),
      listen<{ paused: boolean }>("voice-paused", event => {
        pausedRef.current = event.payload.paused;
        if (event.payload.paused) {
          shortcutDesiredRef.current = false;
          if (liveRef.current) void toggleMic();
          pcmPlayer.reset();
        }
      }),
    ].map(promise => promise.then(stop => { if (disposed) stop(); else unlisteners.push(stop); })))
      .catch(error => notifyRef.current?.({ title: "Atajo no disponible", description: String(error), variant: "warning" }));
    return () => { disposed = true; unlisteners.forEach(stop => stop()); };
  }, [toggleMic]);

  const sendText = useCallback(async (text: string) => {
    if (pausedRef.current) throw new Error("La voz está pausada desde la bandeja del sistema.");
    if (!text.trim()) return;
    setIsProcessing(true);
    try {
      inferenceSocketService.sendText(text.trim());
    } catch (error) {
      setIsProcessing(false);
      throw error;
    }
  }, []);

  const clearTranscript = useCallback(() => setTranscript([]), []);
  const activateFromWake = useCallback(async (text = "") => {
    shortcutDesiredRef.current = null;
    if (text.trim()) { await sendText(text); return; }
    wakeTurnRef.current = true;
    await toggleMic();
    if (!liveRef.current) { wakeTurnRef.current = false; return; }
    wakeTimeoutRef.current = setTimeout(() => {
      wakeTimeoutRef.current = null;
      if (wakeTurnRef.current && liveRef.current && !nativeAudioRecorder.hasSpeech()) void toggleMic();
    }, 15000);
  }, [sendText, toggleMic]);
  const loadConversationTranscript = useCallback((lines: TranscriptLine[], characterName: string) => {
    setTranscript(lines);
    characterNameRef.current = characterName;
    setIsProcessing(false);
    setIsSpeaking(false);
    speakingUntilRef.current = 0;
    if (speakingTimeoutRef.current !== null) window.clearTimeout(speakingTimeoutRef.current);
    speakingTimeoutRef.current = null;
    pcmPlayer.reset();
  }, []);

  const commitProfileSwitch = useCallback(
    async (
      characterIdOrName?: number | string,
      profileName?: string,
      _rules: unknown[] = [],
    ) => {
      setSwitchCount((previous) => previous + 1);

      let resolvedId: number | undefined;
      let resolvedName: string | undefined = profileName;

      if (typeof characterIdOrName === "number") {
        resolvedId = characterIdOrName;
      } else if (typeof characterIdOrName === "string") {
        const parsed = parseInt(characterIdOrName, 10);
        if (Number.isNaN(parsed)) {
          resolvedName = characterIdOrName;
        } else {
          resolvedId = parsed;
        }
      }

      if (resolvedName) {
        characterNameRef.current = resolvedName;
        setTranscript([]);
      }

      if (resolvedId) {
        void tauriBridge.switchActiveCharacter(resolvedId);
        try {
          await sessionService.switchActiveCharacter(userId, resolvedId);
        } catch (e) {
          console.warn("No se pudo persistir active_session_state:", e);
        }

      }

      notifyRef.current?.({
        title: "Perfil conmutado con éxito",
        description: resolvedName
          ? `Runtime de voz sincronizado con ${resolvedName}.`
          : "Runtime de voz sincronizado con el personaje activo.",
        variant: "success",
      });
    },
    [userId],
  );

  const status: FocusStatus = isSpeaking ? "speaking" : isLive ? "listening" : "idle";
  const statusLabel = status === "speaking" ? "HABLANDO" : isProcessing ? "PREPARANDO RESPUESTA" : status === "listening" ? "ESCUCHANDO" : "EN ESPERA";

  return {
    operator: OPERATOR,
    sessionId: SESSION_ID,
    engineState,
    isLive,
    status,
    statusLabel,
    latencyMs,
    audioFormat: AUDIO_FORMAT,
    elapsedSeconds,
    elapsedLabel: formatClock(elapsedSeconds),
    levels,
    transcript,
    isProcessing,
    clearTranscript,
    loadConversationTranscript,
    switchCount,
    lastTranscript,
    memoryRevision,
    needsVoiceReassignment,
    conversationAccessIssue,
    sendText,
    commitProfileSwitch,
    toggleMic,
    activateFromWake,
    pulse,
  };
}
