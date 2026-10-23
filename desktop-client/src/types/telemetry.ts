export interface TurnTelemetry {
  sttMs: number;
  jevMs: number;
  llmMs: number;
  ttsMs: number;
  generatedAudioPath?: string;
}

export interface SessionTurn {
  id: string;
  sender: "user" | "character";
  senderName: string;
  timestamp: string;
  content: string;
  telemetry?: TurnTelemetry;
}

export interface PastSession {
  id: string;
  title: string;
  characterId: string;
  characterName: string;
  dateLabel: string;
  turnCount: number;
  sampleRateKhz: number;
  turns: SessionTurn[];
}
