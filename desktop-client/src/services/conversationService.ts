import { fetchApi } from "./apiClient";

export interface ConversationResponseDto {
  id: number;
  userId?: number;
  characterId?: number;
  characterName?: string;
  title?: string;
  startedAt?: string;
  createdAt?: string;
  turnCount?: number;
  tokenCount?: number;
}

/**
 * Mirrors `messages.telemetry_metadata` (JSONB) on the Spring side. When the
 * persistence layer does not store JSONB yet, the same keys can be mapped
 * directly from the FastAPI telemetry payload.
 */
export interface MessageTelemetryDto {
  stt_ms?: number;
  decision_ms?: number;
  jev_ms?: number;
  llm_ms?: number;
  tts_ms?: number;
  total_ms?: number;
  generated_audio_path?: string | null;
}

export interface MessageResponseDto {
  id: number;
  turnId?: string | null;
  conversationId?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  generatedAudioPath?: string | null;
  telemetryMetadata?: MessageTelemetryDto | null;
  telemetry_metadata?: MessageTelemetryDto | null;
}

export const conversationService = {
  async createConversation(
    userId: number,
    characterId: number,
  ): Promise<ConversationResponseDto> {
    return fetchApi<ConversationResponseDto>(`/conversations/user/${userId}`, {
      method: "POST",
      body: JSON.stringify({ characterId, title: "Nueva conversación" }),
    });
  },

  /** GET /api/conversations/user/{userId} */
  async getConversationsByUser(
    userId: number,
  ): Promise<ConversationResponseDto[]> {
    return fetchApi<ConversationResponseDto[]>(`/conversations/user/${userId}`);
  },

  /** GET /api/messages/conversation/{conversationId} */
  async getMessagesByConversation(
    conversationId: number,
  ): Promise<MessageResponseDto[]> {
    return fetchApi<MessageResponseDto[]>(
      `/messages/conversation/${conversationId}`,
    );
  },

  async deleteConversation(conversationId: number): Promise<void> {
    return fetchApi<void>(`/conversations/${conversationId}`, {
      method: "DELETE",
    });
  },

  async renameConversation(conversationId: number, title: string): Promise<ConversationResponseDto> {
    return fetchApi<ConversationResponseDto>(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  },
};
