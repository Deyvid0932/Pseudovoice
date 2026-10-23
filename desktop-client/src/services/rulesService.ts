import { fetchApi } from "./apiClient";

export interface RulesCatalogResponseDto {
  id: number;
  userId?: number;
  ruleCode: string;
  category: string;
  promptDescription: string;
  createdByVoice?: boolean;
}

export interface CharacterRuleResponseDto {
  id: number;
  characterId: number;
  ruleId: number;
  priority: number;
}

export interface CharacterRuleAssignDto {
  ruleId: number;
  priority: number;
}

export const rulesService = {
  async getGlobalRules(): Promise<RulesCatalogResponseDto[]> {
    return fetchApi<RulesCatalogResponseDto[]>("/rules/global");
  },

  async getUserRules(userId: number): Promise<RulesCatalogResponseDto[]> {
    return fetchApi<RulesCatalogResponseDto[]>(`/rules/user/${userId}`);
  },

  async getCharacterRules(characterId: number): Promise<CharacterRuleResponseDto[]> {
    return fetchApi<CharacterRuleResponseDto[]>(`/character-rules/character/${characterId}`);
  },

  async assignRule(
    characterId: number,
    dto: CharacterRuleAssignDto
  ): Promise<CharacterRuleResponseDto> {
    return fetchApi<CharacterRuleResponseDto>(`/character-rules/character/${characterId}`, {
      method: "POST",
      body: JSON.stringify(dto),
    });
  },

  async unassignRule(assignmentId: number): Promise<void> {
    return fetchApi<void>(`/character-rules/${assignmentId}`, { method: "DELETE" });
  },
};
