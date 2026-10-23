import { pcmPlayer } from "./pcmPlayer";
import { readAccessToken } from "../lib/authStorage";
import { tauriBridge } from "./tauriBridge";
import { voiceCaptureGate } from "./voiceCaptureGate";

const DEFAULT_WS_URL = (import.meta.env.VITE_AI_WS_URL as string | undefined)
  || "ws://127.0.0.1:8000/ws/inference";
const INFERENCE_ACCESS_KEY = (import.meta.env.VITE_AI_ACCESS_KEY as string | undefined)?.trim() ?? "";

export interface SessionConfigPayload {
  character_id: number;
  reference_audio_name: string;
  response_length?: "short" | "normal" | "long";
  save_response_audio?: boolean;
  character_rules: Array<{
    id: number;
    category: string;
    code: string;
    shortLabel: string;
    description: string;
    priority: number;
    isActive: boolean;
  }>;
}

export interface TurnMetrics {
  stt_latency_ms: number;
  decision_latency_ms: number;
  llm_latency_ms: number;
  tts_latency_ms: number;
  total_turn_latency_ms: number;
}

export interface InferenceEvents {
  onSessionReady?: (data: { character_id: number; status: string }) => void;
  onTurnStart?: (data: { turn_id: string }) => void;
  onAudioChunk?: (durationMs: number) => void;
  onTranscript?: (data: { turn_id: string; text: string; stt_latency_ms: number }) => void;
  onAssistantResponse?: (data: { turn_id: string; text: string; saved_audio_id?: string }) => void;
  onPcCommand?: (data: { turn_id: string; command: { action: string; target: string; parameters?: { step?: number } }; metrics: TurnMetrics }) => void;
  onAgentTaskStarted?: (data: { turn_id: string; task_id: number; status: string }) => void;
  onTurnComplete?: (data: { turn_id: string; metrics: TurnMetrics }) => void;
  onMemoryProposed?: (data: { mode?: "automatic" | "suggested"; created?: number; updated?: number }) => void;
  onError?: (error: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

class InferenceSocketService {
  private socket: WebSocket | null = null;
  private wsUrl: string = DEFAULT_WS_URL;
  private listeners: InferenceEvents = {};
  private reconnectTimer: number | null = null;
  private shouldReconnect: boolean = true;
  private sessionConfig: { config: SessionConfigPayload; conversationId: number } | null = null;
  private sessionReady = false;
  private authenticated = false;
  private archiveTurnId: string | null = null;
  private archiveRequested = false;
  private archiveWrites: Promise<void> = Promise.resolve();
  private inputAudioPending = false;
  private serverVad = false;
  private captureEnabled = false;
  private captureAutoEnd = true;

  public usesServerVad(): boolean { return this.serverVad; }

  public startCapture(autoEnd = true): void {
    this.captureEnabled = true;
    this.captureAutoEnd = autoEnd;
    if (this.serverVad && this.isSessionReady() && !voiceCaptureGate.isBlocked()) {
      this.socket?.send(JSON.stringify({ type: "capture_start", auto_end: autoEnd }));
    }
  }

  public refreshContext(): void {
    if (this.isSessionReady()) this.socket?.send(JSON.stringify({ type: "context_refresh" }));
  }

  constructor() {
    voiceCaptureGate.subscribe(blocked => {
      if (blocked) this.discardInputAudio();
      else if (this.captureEnabled) this.startCapture(this.captureAutoEnd);
    });
    window.addEventListener("pseudovoice:context-changed", () => this.refreshContext());
  }

  private discardInputAudio(): void {
    if ((this.inputAudioPending || this.serverVad) && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "discard_audio" }));
    }
    this.inputAudioPending = false;
  }

  public setEventListeners(events: InferenceEvents): void {
    this.listeners = { ...this.listeners, ...events };
  }

  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (/^wss:/i.test(this.wsUrl) && !INFERENCE_ACCESS_KEY) {
      this.listeners.onConnectionChange?.(false);
      this.listeners.onError?.("Falta INFERENCE_ACCESS_KEY en el .env de la raíz o VITE_AI_ACCESS_KEY en el entorno del cliente; debe coincidir con la clave del servicio de voz.");
      return;
    }

    this.shouldReconnect = true;
    this.authenticated = false;
    try {
      this.socket = new WebSocket(this.wsUrl);
      // Configuración obligatoria: tramas binarias como ArrayBuffer nativo
      this.socket.binaryType = "arraybuffer";

      this.socket.onopen = () => {
        console.log("✓ WebSocket conectado al motor de IA en", this.wsUrl);
        if (this.sessionConfig) {
          if (INFERENCE_ACCESS_KEY) {
            this.socket?.send(JSON.stringify({ type: "auth", token: INFERENCE_ACCESS_KEY }));
          } else {
            this.authenticated = true;
            this.sendSessionConfig(this.sessionConfig.config, this.sessionConfig.conversationId);
          }
        } else if (INFERENCE_ACCESS_KEY) {
          this.socket?.send(JSON.stringify({ type: "auth", token: INFERENCE_ACCESS_KEY }));
        } else {
          this.authenticated = true;
        }
        this.listeners.onConnectionChange?.(true);
        if (this.reconnectTimer) {
          window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.socket.onclose = (event) => {
        console.warn("WebSocket de inferencia desconectado.", {
          code: event.code,
          reason: event.reason || "sin detalle del servidor",
          clean: event.wasClean,
        });
        this.sessionReady = false;
        this.authenticated = false;
        this.abortCurrentAudioArchive();
        this.inputAudioPending = false;
        pcmPlayer.reset();
        voiceCaptureGate.release("inference-turn");
        this.listeners.onConnectionChange?.(false);
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        console.error("Error en WebSocket de inferencia:", err);
        this.listeners.onError?.("Fallo de conexión con el motor de IA");
      };

      this.socket.onmessage = (event: MessageEvent) => {
        // TRAMAS BINARIAS: Chunks de audio PCM sintetizado
        if (event.data instanceof ArrayBuffer) {
          pcmPlayer.feedBinaryChunk(event.data);
          if (this.archiveRequested && this.archiveTurnId) {
            const turnId = this.archiveTurnId;
            const chunk = new Uint8Array(event.data.slice(0));
            this.archiveWrites = this.archiveWrites.then(() => {
              return tauriBridge.appendGeneratedAudioArchive(turnId, chunk);
            }).catch(error => {
              if (this.archiveTurnId === turnId) this.archiveRequested = false;
              console.warn("No se pudo archivar este bloque de audio:", error);
              return tauriBridge.discardGeneratedAudioArchive(turnId).catch(discardError => console.warn("No se pudo limpiar el WAV incompleto:", discardError));
            });
          }
          this.listeners.onAudioChunk?.((event.data.byteLength / 2 / 24000) * 1000);
          return;
        }

        // TRAMAS DE TEXTO: Eventos JSON estructurados con discriminador
        if (typeof event.data === "string") {
          try {
            const data = JSON.parse(event.data);
            switch (data.type) {
              case "authenticated":
                this.authenticated = true;
                if (this.sessionConfig) {
                  this.sendSessionConfig(this.sessionConfig.config, this.sessionConfig.conversationId);
                }
                break;
              case "session_ready":
                if (!this.sessionConfig || (data.character_id !== undefined && data.character_id !== this.sessionConfig.config.character_id)
                    || (data.conversation_id !== undefined && data.conversation_id !== this.sessionConfig.conversationId)) break;
                this.sessionReady = true;
                this.serverVad = data.server_vad === true;
                if (typeof data.echo_guard_ms === "number") voiceCaptureGate.setGuardMs(data.echo_guard_ms);
                voiceCaptureGate.release("session-switch");
                this.listeners.onSessionReady?.(data);
                break;
              case "turn_start":
                this.inputAudioPending = false;
                voiceCaptureGate.block("inference-turn");
                pcmPlayer.reset();
                this.archiveTurnId = typeof data.turn_id === "string" ? data.turn_id : null;
                this.archiveRequested = Boolean(this.sessionConfig?.config.save_response_audio && this.archiveTurnId && tauriBridge.isTauri());
                if (this.archiveRequested && this.archiveTurnId) {
                  const turnId = this.archiveTurnId;
                  this.archiveWrites = this.archiveWrites.then(() => tauriBridge.startGeneratedAudioArchive(turnId))
                    .catch(error => {
                      if (this.archiveTurnId === turnId) this.archiveRequested = false;
                      console.warn("No se pudo iniciar el archivo de audio:", error);
                      return tauriBridge.discardGeneratedAudioArchive(turnId).catch(discardError => console.warn("No se pudo limpiar el archivo de audio:", discardError));
                    });
                }
                this.listeners.onTurnStart?.(data);
                break;
              case "transcript":
                this.listeners.onTranscript?.(data);
                break;
              case "assistant_response":
                this.listeners.onAssistantResponse?.({ ...data, saved_audio_id: this.archiveRequested ? data.turn_id : undefined });
                break;
              case "pc_command":
                this.listeners.onPcCommand?.(data);
                break;
              case "agent_task_started":
                this.listeners.onAgentTaskStarted?.(data);
                break;
              case "memory_proposed":
                this.refreshContext();
                this.listeners.onMemoryProposed?.({ mode: data.mode, created: data.created, updated: data.updated });
                break;
              case "capture_discarded":
                if (data.reason === "unclear_speech") this.listeners.onError?.("No se entendió; puedes repetir.");
                if (this.captureEnabled) this.startCapture(this.captureAutoEnd);
                break;
              case "turn_complete":
                voiceCaptureGate.release("inference-turn");
                if (this.archiveRequested && this.archiveTurnId) {
                  const turnId = this.archiveTurnId;
                  this.archiveWrites = this.archiveWrites.then(async () => {
                    const saved = await tauriBridge.finishGeneratedAudioArchive(turnId);
                    if (!saved) console.info("La respuesta no generó audio para guardar.");
                  }).catch(error => {
                    if (this.archiveTurnId === turnId) this.archiveRequested = false;
                    console.warn("No se pudo finalizar el archivo de audio:", error);
                    return tauriBridge.discardGeneratedAudioArchive(turnId).catch(discardError => console.warn("No se pudo limpiar el WAV incompleto:", discardError));
                  });
                }
                this.archiveTurnId = null;
                this.archiveRequested = false;
                this.listeners.onTurnComplete?.(data);
                break;
              case "error":
                voiceCaptureGate.release("inference-turn");
                this.listeners.onError?.(data.message || "Error en el turno de inferencia");
                break;
              case "agent_voice_unavailable":
                this.listeners.onError?.(data.message);
                break;
            }
          } catch (e) {
            console.error("Error parseando evento JSON del socket:", e, event.data);
          }
        }
      };
    } catch (e) {
      console.error("Error instanciando WebSocket:", e);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      console.log("Intentando reconectar con motor de IA...");
      this.connect();
    }, 2500);
  }

  public sendSessionConfig(config: SessionConfigPayload, conversationId: number): void {
    this.discardInputAudio();
    this.sessionConfig = { config, conversationId };
    this.sessionReady = false;
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.authenticated) {
      this.socket.send(
        JSON.stringify({
          type: "session_config",
          user_token: readAccessToken(),
          server_vad: true,
          conversation_id: conversationId,
          data: config,
        })
      );
    }
  }

  public clearSessionConfig(): void {
    this.discardInputAudio();
    this.abortCurrentAudioArchive();
    this.sessionConfig = null;
    this.sessionReady = false;
  }

  private abortCurrentAudioArchive(): void {
    const turnId = this.archiveTurnId;
    const shouldDiscard = this.archiveRequested && turnId !== null;
    this.archiveTurnId = null;
    this.archiveRequested = false;
    if (shouldDiscard && turnId) {
      this.archiveWrites = this.archiveWrites.then(() => tauriBridge.discardGeneratedAudioArchive(turnId))
        .catch(error => console.warn("No se pudo limpiar el audio interrumpido:", error));
    }
  }

  public isSessionReady(): boolean {
    return this.socket?.readyState === WebSocket.OPEN && this.sessionReady;
  }
  public isSessionReadyForCharacter(characterId: number): boolean {
    return this.isSessionReady() && this.sessionConfig?.config.character_id === characterId;
  }
  public discardCapturedAudio(): void {
    this.discardInputAudio();
  }
  public prepareSessionSwitch(): void {
    this.sessionReady = false;
    voiceCaptureGate.block("session-switch");
    this.discardInputAudio();
  }
  public refreshSession(characterId?: number, conversationId?: number): void {
    const current = this.sessionConfig;
    if (!current || (characterId !== undefined && current.config.character_id !== characterId)
        || (conversationId !== undefined && current.conversationId !== conversationId)) return;
    this.sendSessionConfig(current.config, current.conversationId);
  }

  public sendAudioChunk(pcmChunk: ArrayBuffer | Uint8Array): void {
    if (this.isSessionReady() && !voiceCaptureGate.isBlocked() && pcmChunk.byteLength > 0) {
      this.inputAudioPending = true;
      this.socket!.send(pcmChunk as any);
    }
  }

  public sendText(text: string): void {
    if (!this.isSessionReady()) throw new Error("Espera a que el motor configure la sesión del personaje.");
    this.discardInputAudio();
    this.socket!.send(JSON.stringify({ type: "text_message", text }));
    voiceCaptureGate.block("inference-turn");
  }

  public sendEndOfSpeech(): void {
    this.captureEnabled = false;
    if (this.serverVad && this.isSessionReady() && !voiceCaptureGate.isBlocked()) {
      this.socket!.send(JSON.stringify({ type: "end_of_speech" }));
      this.inputAudioPending = false;
      return;
    }
    if (this.isSessionReady() && !voiceCaptureGate.isBlocked() && this.inputAudioPending) {
      this.socket!.send(JSON.stringify({ type: "end_of_speech" }));
      this.inputAudioPending = false;
      voiceCaptureGate.block("inference-turn");
    }
  }

  public disconnect(): void {
    this.captureEnabled = false;
    voiceCaptureGate.release("session-switch");
    this.discardInputAudio();
    pcmPlayer.reset();
    voiceCaptureGate.release("inference-turn");
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}

export const inferenceSocketService = new InferenceSocketService();
