export type ProfileStatus = "in_use" | "inactive";

export type RuleCategory = "PERSONALIDAD" | "TONO" | "VOCABULARIO";

export type EngineState = "OK" | "DEGRADED" | "OFFLINE";

export type AvatarStatus = "online" | "offline" | "busy" | "none";

export type ToastVariant = "success" | "info" | "warning" | "error";

/** Two-stop gradient used to render a deterministic, unique avatar. */
export type Palette = [string, string];

export type SuiteView = "focus" | "logs";

export type FocusStatus = "listening" | "speaking" | "idle";

export type TransportMode = "websocket" | "local";

export type SocketState = "connecting" | "live" | "offline";

export interface VoiceProfile {
  id: string;
  name: string;
  referenceAudioPath?: string;
  avatarUrl?: string | null;
  sourceVoiceId?: string | null;
  sourceName?: string | null;
  sourceAvatarUrl?: string | null;
  personalityPrompt?: string | null;
  archetype: string;
  avatarSeed: string;
  palette: Palette;
  status: ProfileStatus;
}

export interface Rule {
  id: string;
  category: RuleCategory;
  code: string;
  shortLabel: string;
  description: string;
  priority: number;
  isActive: boolean;
}

export interface SessionOperator {
  id: string;
  displayName: string;
  role: string;
  accessLevel: string;
  avatarSeed: string;
  palette: Palette;
}

export interface AudioFormat {
  sampleRate: number;
  bitDepth: number;
}

export interface ActiveSessionState {
  operator: SessionOperator;
  activeCharacterId: string | null;
  latencyMs: number;
  engineState: EngineState;
  format: AudioFormat;
  elapsedSeconds: number;
  isLive: boolean;
}

export interface ToastNotification {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface NavItem {
  id: SuiteView;
  label: string;
}

export interface PanelHeading {
  index: string;
  section: string;
  title: string;
}

/* ------------------------------------------------------------------ *
 * Telemetry & history
 *
 * Mirrors `messages.telemetry_metadata` (JSONB) on the Spring side or the
 * telemetry keys emitted by the FastAPI pipeline: stt/jev/llm/tts latency
 * plus the cached PCM artifact path.
 * ------------------------------------------------------------------ */
export interface MessageTelemetry {
  sttMs: number;
  jevMs: number;
  llmMs: number;
  ttsMs: number;
  totalMs: number;
  generatedAudioPath: string | null;
}

export interface ConversationSummary {
  id: number;
  title: string;
  characterName: string;
  avatarSeed: string;
  avatarUrl?: string | null;
  characterId?: number | null;
  palette: Palette;
  startedAt: string;
  turns: number;
  tokens: number;
}

export interface ConversationMessage {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  telemetry: MessageTelemetry | null;
}

export interface TranscriptLine {
  id: string;
  role: "user" | "assistant";
  speaker: string;
  text: string;
  createdAt?: string;
  savedAudioId?: string;
}

/* ------------------------------------------------------------------ *
 * Neural Lab rule graph
 * ------------------------------------------------------------------ */
export type SatelliteCategory = "ACOUSTIC" | "BEHAVIOR" | "SAFETY" | "STYLE";

export interface RuleGraphNode {
  id: string;
  code: string;
  name: string;
  category: SatelliteCategory;
  priority: number;
  description: string;
  /** Memoized logical coordinate inside a 1200 x 520 viewBox. */
  x: number;
  y: number;
}

/**
 * Mutation emitted by the Neural Lab store. It is translated into the
 * `session_config` WebSocket event consumed by the Python engine.
 */
export interface SessionConfigMutation {
  connected: Record<string, boolean>;
  priorities: Record<string, number>;
}

export interface SessionConfigSnapshot {
  connected: Record<string, boolean>;
  priorities: Record<string, number>;
  selectedId: string | null;
}

export interface SatelliteCategoryMeta {
  id: SatelliteCategory;
  label: string;
  accent: string;
  edge: string;
}
