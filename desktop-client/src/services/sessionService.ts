import { fetchApi } from "./apiClient";

export interface ActiveSessionStateResponseDto {
  userId: number;
  activeCharacterId: number;
  updatedAt?: string;
}

export const sessionService = {
  async getActiveSession(userId: number): Promise<ActiveSessionStateResponseDto> {
    return fetchApi<ActiveSessionStateResponseDto>(`/session-state/user/${userId}`);
  },

  async switchActiveCharacter(
    userId: number,
    characterId: number
  ): Promise<ActiveSessionStateResponseDto> {
    return fetchApi<ActiveSessionStateResponseDto>(
      `/session-state/user/${userId}/character/${characterId}`,
      {
        method: "PUT",
      }
    );
  },
};
