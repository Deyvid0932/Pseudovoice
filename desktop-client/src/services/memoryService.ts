import { fetchApi } from "./apiClient";
export type MemoryScope = "private" | "group" | "all";
export interface MemoryWrite { characterId: number; content: string; scope: MemoryScope; groupId: number | null; approved: boolean; embedding?: number[] | null; sensitive?: boolean }
export interface UserMemory extends MemoryWrite { id: number; conversationId: number | null; createdAt: string; updatedAt: string; origin: "manual" | "suggested" | "automatic"; sensitive: boolean; revision: number }
export interface MemoryGroupWrite { name: string; personalityInstructions: string | null; characterIds: number[] }
export interface MemoryGroup extends MemoryGroupWrite { id: number }
export type MemoryMode = "automatic" | "suggested" | "manual";
export interface MemoryPreferences { mode: MemoryMode; sharedConsent: boolean; sensitiveConsent: boolean; updatedAt: string }
export interface MemoryActivity { id: number; memoryId: number | null; characterId: number | null; action: "created" | "updated" | "retrieved" | "undone"; source: "automatic" | "suggested" | "manual" | "system"; contentPreview: string; undoAvailable: boolean; contextItems: number; contextTokensEstimate: number; createdAt: string }
export interface MemoryUsage { extraction_input_tokens: number; extraction_output_tokens: number; extraction_cost_usd: number; retrieval_tokens_estimate: number; created: number; updated: number; skipped: number }
export const memoryService = {
  list: (characterId?: number) => fetchApi<UserMemory[]>(`/memory-settings${characterId ? `?characterId=${characterId}` : ""}`),
  save: (value: MemoryWrite, id?: number) => fetchApi<UserMemory>(`/memory-settings${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(value) }),
  remove: (id: number) => fetchApi<void>(`/memory-settings/${id}`, { method: "DELETE" }),
  preferences: () => fetchApi<MemoryPreferences>("/memory-settings/preferences"),
  savePreferences: (value: Omit<MemoryPreferences, "updatedAt">) => fetchApi<MemoryPreferences>("/memory-settings/preferences", { method: "PUT", body: JSON.stringify(value) }),
  activity: () => fetchApi<MemoryActivity[]>("/memory-settings/activity?limit=50"),
  undo: (id: number) => fetchApi<void>(`/memory-settings/activity/${id}/undo`, { method: "POST" }),
  usage: () => fetchApi<MemoryUsage>("/memory-settings/usage"),
  groups: () => fetchApi<MemoryGroup[]>("/memory-groups"),
  saveGroup: (value: MemoryGroupWrite, id?: number) => fetchApi<MemoryGroup>(`/memory-groups${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: JSON.stringify(value) }),
  removeGroup: (id: number) => fetchApi<void>(`/memory-groups/${id}`, { method: "DELETE" }),
};
