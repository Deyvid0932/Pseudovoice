import { fetchApi } from "./apiClient";

export interface VoiceCharacterCreateDto {
  characterName: string;
  referenceAudioPath: string;
  language?: string;
  avatarUrl?: string | null;
  providerSource?: "local" | "fish" | "catalog";
  providerVoiceId?: string | null;
  catalogOriginalName?: string | null;
  catalogImageUrl?: string | null;
  personalityPrompt?: string | null;
}

export interface VoiceCharacterResponseDto {
  id: number;
  userId: number;
  characterName: string;
  referenceAudioPath: string;
  language: string;
  isActive: boolean;
  avatarUrl?: string | null;
  providerSource?: "local" | "fish" | "catalog" | null;
  providerVoiceId?: string | null;
  catalogOriginalName?: string | null;
  catalogImageUrl?: string | null;
  personalityPrompt?: string | null;
  /** UI aliases; the Spring API uses provider/catalog field names. */
  sourceVoiceId?: string | null;
  sourceName?: string | null;
  sourceAvatarUrl?: string | null;
}

export const characterService = {
  async getCharactersByUser(userId: number): Promise<VoiceCharacterResponseDto[]> {
    return (await fetchApi<VoiceCharacterResponseDto[]>(`/characters/user/${userId}`)).map(mapCatalogMetadata);
  },

  async createCharacter(
    userId: number,
    dto: VoiceCharacterCreateDto
  ): Promise<VoiceCharacterResponseDto> {
    return fetchApi<VoiceCharacterResponseDto>(`/characters/user/${userId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    }).then(mapCatalogMetadata);
  },

  async updateCharacter(
    characterId: number,
    dto: VoiceCharacterCreateDto
  ): Promise<VoiceCharacterResponseDto> {
    return fetchApi<VoiceCharacterResponseDto>(`/characters/${characterId}`, {
      method: "PUT",
      body: JSON.stringify(dto),
    }).then(mapCatalogMetadata);
  },

  async deleteCharacter(characterId: number): Promise<void> {
    return fetchApi<void>(`/characters/${characterId}`, {
      method: "DELETE",
    });
  },
};

function mapCatalogMetadata(character: VoiceCharacterResponseDto): VoiceCharacterResponseDto {
  return {
    ...character,
    sourceVoiceId: character.providerVoiceId,
    sourceName: character.catalogOriginalName,
    sourceAvatarUrl: character.catalogImageUrl,
  };
}
