import { useCallback, useEffect, useMemo, useState } from "react";
import {
  conversationService,
  type MessageResponseDto,
  type MessageTelemetryDto,
} from "../services/conversationService";
import type {
  ConversationMessage,
  ConversationSummary,
  VoiceProfile,
} from "../types/voice";

export type HistorySource = "api" | "cache";

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  selectedConversation: ConversationSummary | null;
  selectedId: number | null;
  messages: ConversationMessage[];
  previews: Record<number, string>;
  loadingConversations: boolean;
  loadingMessages: boolean;
  error: string | null;
  source: HistorySource;
  selectConversation: (conversationId: number | null) => void;
  createConversation: (character: VoiceProfile) => Promise<number>;
  renameSession: (conversationId: number, title: string) => Promise<void>;
  deleteSession: (conversationId: number) => Promise<void>;
  exportLogs: () => void;
}

function telemetryFromDto(dto: MessageTelemetryDto): NonNullable<ConversationMessage["telemetry"]> {
  const sttMs = dto.stt_ms ?? 0;
  const jevMs = dto.jev_ms ?? dto.decision_ms ?? 0;
  const llmMs = dto.llm_ms ?? 0;
  const ttsMs = dto.tts_ms ?? 0;
  return {
    sttMs,
    jevMs,
    llmMs,
    ttsMs,
    totalMs: dto.total_ms ?? sttMs + jevMs + llmMs + ttsMs,
    generatedAudioPath: dto.generated_audio_path ?? null,
  };
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "--:--:--";
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleTimeString();
}

function mapMessage(dto: MessageResponseDto): ConversationMessage {
  const telemetry = dto.telemetryMetadata ?? dto.telemetry_metadata ?? (dto.generatedAudioPath ? { generated_audio_path: dto.generatedAudioPath } : null);
  return {
    id: dto.id,
    conversationId: dto.conversationId ?? 0,
    role: dto.role,
    content: dto.content,
    createdAt: formatTimestamp(dto.createdAt),
    telemetry: telemetry ? telemetryFromDto(telemetry) : null,
  };
}

export function localAudioId(path: string | null | undefined): string | undefined {
  return path?.startsWith("local-audio:") ? path.slice("local-audio:".length) : undefined;
}

/** GET /api/conversations/user/{authenticatedUserId} + GET /api/messages/conversation/{id} */
export function useConversations(userId: number, profiles: VoiceProfile[] = []): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [source, setSource] = useState<HistorySource>("api");
  const [error, setError] = useState<string | null>(null);
  const profileById = useMemo(() => new Map(profiles.map(profile => [Number(profile.id), profile])), [profiles]);

  useEffect(() => {
    let active = true;
    setLoadingConversations(true);
    conversationService
      .getConversationsByUser(userId)
      .then((dtos) => {
        if (!active) {
          return;
        }
        setLoadingConversations(false);
        const mapped: ConversationSummary[] = (dtos ?? []).map((dto) => {
            const profile = profileById.get(dto.characterId ?? -1);
            const name = profile?.name ?? "Personaje no disponible";
            return {
              id: dto.id,
              title: dto.title?.trim() || "Conversación",
              characterName: name,
              avatarSeed: profile?.avatarSeed ?? `unavailable-${dto.id}`,
              avatarUrl: profile?.avatarUrl || profile?.sourceAvatarUrl || null,
              characterId: dto.characterId ?? null,
              palette: profile?.palette ?? ["#38bdf8", "#4f46e5"],
              startedAt: dto.startedAt ?? dto.createdAt ?? "—",
              turns: dto.turnCount ?? 0,
              tokens: dto.tokenCount ?? 0,
            };
        });
        setConversations(mapped);
        setError(null);
        setSource("api");
        setSelectedId((current) =>
          current && mapped.some((item) => item.id === current)
            ? current
            : (mapped[0]?.id ?? null),
        );
      })
      .catch(() => {
        if (active) {
          setLoadingConversations(false);
          setConversations([]);
          setSelectedId(null);
          setError("No se pudo cargar el historial. Comprueba la conexión con PseudoVoice e inténtalo otra vez.");
        }
      });
    return () => {
      active = false;
    };
  }, [userId, profileById]);

  useEffect(() => {
    let active = true;
    const pending = conversations.filter(item => previews[item.id] === undefined);
    let cursor = 0;
    const worker = async () => {
      while (active) {
        const item = pending[cursor++];
        if (!item) return;
        try {
          const rows = await conversationService.getMessagesByConversation(item.id);
          if (!active) return;
          const last = rows.length ? rows[rows.length - 1].content?.trim() : "";
          if (last) setPreviews(previous => ({ ...previous, [item.id]: last }));
          else setPreviews(previous => ({ ...previous, [item.id]: "" }));
        } catch {
          if (active) setPreviews(previous => ({ ...previous, [item.id]: "" }));
        }
      }
    };
    void Promise.all([worker(), worker()]);
    return () => { active = false; };
  }, [conversations, previews]);

  useEffect(() => {
    if (selectedId === null) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    conversationService
      .getMessagesByConversation(selectedId)
      .then((dtos) => {
        if (!active) {
          return;
        }
        setLoadingMessages(false);
        if (dtos && dtos.length > 0) {
          setMessages(dtos.map(mapMessage));
          setSource("api");
        } else setMessages([]);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setLoadingMessages(false);
        setMessages([]);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectConversation = useCallback((conversationId: number | null) => {
    setSelectedId(conversationId);
  }, []);

  const createConversation = useCallback(async (character: VoiceProfile) => {
    const created = await conversationService.createConversation(userId, Number(character.id));
    const item: ConversationSummary = {
      id: created.id,
      title: created.title?.trim() || "Conversación",
      characterName: character.name,
      avatarSeed: character.avatarSeed,
      avatarUrl: character.avatarUrl || character.sourceAvatarUrl || null,
      characterId: Number(character.id),
      palette: character.palette,
      startedAt: created.startedAt ?? created.createdAt ?? new Date().toISOString(),
      turns: 0,
      tokens: 0,
    };
    setConversations(previous => [item, ...previous]);
    setError(null);
    return created.id;
  }, [userId]);

  const deleteSession = useCallback(async (conversationId: number) => {
    await conversationService.deleteConversation(conversationId);
    const deleted = conversations.find(item => item.id === conversationId);
    const remaining = conversations.filter(item => item.id !== conversationId);
    setConversations(remaining);
    setPreviews(previous => {
      const next = { ...previous };
      delete next[conversationId];
      return next;
    });
    if (selectedId === conversationId) {
      const sameCharacter = remaining.filter(item => item.characterId === deleted?.characterId);
      setSelectedId(sameCharacter[0]?.id ?? remaining[0]?.id ?? null);
    }
    setError(null);
  }, [conversations, selectedId]);

  const renameSession = useCallback(async (conversationId: number, title: string) => {
    const updated = await conversationService.renameConversation(conversationId, title);
    setConversations(previous => previous.map(item => item.id === conversationId
      ? { ...item, title: updated.title?.trim() || title.trim() }
      : item));
    setError(null);
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  const exportLogs = useCallback(() => {
    if (!selectedConversation) {
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      conversation: selectedConversation,
      messages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pseudovoice-session-${selectedConversation.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedConversation, messages]);

  return {
    conversations,
    selectedConversation,
    selectedId,
    messages,
    previews,
    loadingConversations,
    loadingMessages,
    error,
    source,
    selectConversation,
    createConversation,
    renameSession,
    deleteSession,
    exportLogs,
  };
}
