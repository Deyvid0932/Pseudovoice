import { fetchApi } from "./apiClient";

export interface AgentPreferences {
  enabled: boolean;
  autoApprovePublicNavigation: boolean;
  publicNavigationOrigins: string[];
  allowPublicNavigation: boolean;
  allowAuthenticatedNavigation: boolean;
  allowRead: boolean;
  allowFormFill: boolean;
  allowDownloads: boolean;
  allowUploads: boolean;
  allowModifications: boolean;
  whatsappEnabled: boolean;
  authorizationMode: "per_action" | "temporary_contact";
  maxSteps: number;
  deepseekBudgetUsd: number;
  fishBudgetUsd: number;
  updatedAt: string;
}

export type AgentTaskStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "interrupted" | "cancelled" | "uncertain";
export interface AgentTask {
  id: number;
  runId: string;
  characterId: number;
  characterName: string;
  conversationId: number;
  title: string;
  status: AgentTaskStatus;
  summary: string | null;
  errorCode: string | null;
  stepCount: number;
  inputTokens: number;
  outputTokens: number;
  deepseekCostUsd: number;
  fishCostUsd: number;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface AgentStep {
  id: number;
  sequence: number;
  toolName: string;
  actionClass: "read" | "write" | "external_send";
  targetOrigin: string | null;
  status: "planned" | "awaiting_approval" | "running" | "succeeded" | "failed" | "uncertain" | "skipped";
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentApproval {
  id: number;
  taskId: number;
  stepId: number;
  characterId: number;
  characterName: string;
  actionLabel: string;
  destination: string | null;
  payloadJson: string;
  payloadHash: string;
  status: "pending" | "approved" | "rejected" | "consumed" | "expired";
  expiresAt: string;
  createdAt: string;
}

const defaults: AgentPreferences = {
  enabled: false,
  autoApprovePublicNavigation: false,
  publicNavigationOrigins: [],
  allowPublicNavigation: true,
  allowAuthenticatedNavigation: false,
  allowRead: true,
  allowFormFill: false,
  allowDownloads: false,
  allowUploads: false,
  allowModifications: false,
  whatsappEnabled: false,
  authorizationMode: "per_action",
  maxSteps: 15,
  deepseekBudgetUsd: 0.02,
  fishBudgetUsd: 0,
  updatedAt: "",
};

export const agentService = {
  defaults,
  preferences: () => fetchApi<AgentPreferences>("/agent/preferences"),
  savePreferences: (value: AgentPreferences) => {
    const { updatedAt: _updatedAt, ...body } = value;
    return fetchApi<AgentPreferences>("/agent/preferences", { method: "PUT", body: JSON.stringify(body) });
  },
  tasks: (limit = 50) => fetchApi<AgentTask[]>(`/agent/tasks?limit=${limit}`),
  task: (id: number) => fetchApi<AgentTask>(`/agent/tasks/${id}`),
  steps: (id: number) => fetchApi<AgentStep[]>(`/agent/tasks/${id}/steps`),
  pendingApprovals: () => fetchApi<AgentApproval[]>("/agent/approvals/pending"),
  approve: (taskId: number, approvalId: number) => fetchApi<AgentApproval>(`/agent/tasks/${taskId}/approvals/${approvalId}/approve`, { method: "POST" }),
  reject: (taskId: number, approvalId: number) => fetchApi<AgentApproval>(`/agent/tasks/${taskId}/approvals/${approvalId}/reject`, { method: "POST" }),
  cancel: (taskId: number) => fetchApi<AgentTask>(`/agent/tasks/${taskId}/cancel`, { method: "POST" }),
};
