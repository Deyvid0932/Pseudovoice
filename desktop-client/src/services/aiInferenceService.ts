import { readAccessToken } from "../lib/authStorage";
const configuredHttpUrl = import.meta.env.VITE_AI_HTTP_URL as string | undefined;
const configuredWsUrl = import.meta.env.VITE_AI_WS_URL as string | undefined;
const httpUrlFromWs = configuredWsUrl
  ?.replace(/^wss:/i, "https:")
  .replace(/^ws:/i, "http:")
  .replace(/\/ws\/inference\/?$/i, "");
const HTTP_BASE_URL = (configuredHttpUrl || httpUrlFromWs || "http://127.0.0.1:8000").replace(/\/$/, "");
const INFERENCE_ACCESS_KEY = (import.meta.env.VITE_AI_ACCESS_KEY as string | undefined)?.trim();

export interface InferenceHealth {
  service: string;
  api_version: string;
  websocket_path: string;
  voice_upload_path: string;
  status: string;
  mode: string;
  voice_models_ready: boolean;
  stt_ready: boolean;
  fish_configured: boolean;
  deepseek_configured: boolean;
  persistence_backend_configured: boolean;
  inference_auth_required: boolean;
  inference_auth_configured: boolean;
  deepseek_model: string;
}

export interface CatalogVoice {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string;
  languages: string[];
  sample_url: string | null;
  state: string;
}

async function voiceRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (INFERENCE_ACCESS_KEY) headers.set("Authorization", `Bearer ${INFERENCE_ACCESS_KEY}`);
  const token = readAccessToken();
  if (token) headers.set("X-User-Authorization", `Bearer ${token}`);
  const response = await fetch(`${HTTP_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail || `Servicio de voz: HTTP ${response.status}`);
  }
  return response;
}

export const aiInferenceService = {
  async detectWake(audio: Int16Array, phrase: string, characters: Array<{ id: number; name: string }>, signal: AbortSignal): Promise<{ character_id: number | null; remaining_text: string }> {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(HTTP_BASE_URL).hostname)) {
      throw new Error("La activación por voz requiere que el motor de voz esté en este PC.");
    }
    const bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return (await voiceRequest("/voice/wake", {
      method: "POST", signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase, characters, audio_base64: btoa(binary) }),
    })).json();
  },
  async startAgentTask(input: { character_id: number; conversation_id: number; text: string }): Promise<{ id: number; status: string }> {
    return (await voiceRequest("/agent/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })).json();
  },
  async cancelAgentTask(taskId: number): Promise<void> {
    await voiceRequest(`/agent/tasks/${taskId}/cancel`, { method: "POST" });
  },
  async interruptAgentTask(taskId: number): Promise<void> {
    await voiceRequest(`/agent/tasks/${taskId}/interrupt`, { method: "POST" });
  },
  async waitForVoice(voiceId: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const status = await (await voiceRequest(`/voices/status/${encodeURIComponent(voiceId)}`)).json() as { id: string; state: string };
      if (["trained", "ready"].includes(status.state.toLowerCase())) return;
      if (["failed", "error"].includes(status.state.toLowerCase())) throw new Error("La voz no pudo entrenarse.");
      await new Promise(resolve => window.setTimeout(resolve, 1500));
    }
    throw new Error("La voz sigue entrenándose. Inténtalo de nuevo en unos momentos.");
  },
  async getCatalog(q: string, language: string, page: number, signal?: AbortSignal): Promise<{ items: CatalogVoice[]; has_more: boolean; total: number }> {
    const params = new URLSearchParams({ q, language, page: String(page) });
    return (await voiceRequest(`/voices/catalog?${params}`, { signal })).json();
  },
  async previewVoice(voiceId: string, text: string): Promise<Blob> {
    return (await voiceRequest("/voices/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: voiceId, text }),
    })).blob();
  },
  async embedText(text: string): Promise<number[]> {
    const payload = await (await voiceRequest("/memories/embedding", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })).json() as { embedding: number[] };
    if (!Array.isArray(payload.embedding) || payload.embedding.length !== 384) {
      throw new Error("El motor devolvió un embedding inválido para la memoria.");
    }
    return payload.embedding;
  },
  hasAccessKey(): boolean {
    return Boolean(INFERENCE_ACCESS_KEY);
  },

  async checkHealth(): Promise<InferenceHealth> {
    const response = await fetch(`${HTTP_BASE_URL}/health`);
    if (!response.ok) throw new Error(`Motor IA respondió HTTP ${response.status}`);
    const health = await response.json() as InferenceHealth;
    if (health.service !== "pseudovoice-inference") {
      throw new Error("La dirección configurada no apunta al servicio local de PseudoVoice. Inicia el motor de voz en tu PC.");
    }
    return health;
  },

  async uploadReferenceVoice(filename: string, file: File, voiceName: string): Promise<string> {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("name", voiceName);
    let response: Response;
    try {
      response = await fetch(`${HTTP_BASE_URL}/voices/${encodeURIComponent(filename)}`, {
        method: "POST",
        body: form,
        headers: {
          ...(INFERENCE_ACCESS_KEY ? { Authorization: `Bearer ${INFERENCE_ACCESS_KEY}` } : {}),
          ...(readAccessToken() ? { "X-User-Authorization": `Bearer ${readAccessToken()}` } : {}),
        },
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("No se pudo conectar al servicio de voz. Inícialo en tu PC y comprueba que escucha en el puerto 8000.");
      }
      throw error;
    }
    if (!response.ok) {
      let message = `No se pudo subir la voz (HTTP ${response.status})`;
      try {
        const body = await response.json() as { detail?: string };
        if (body.detail) message = body.detail;
      } catch {
        // Keep the status-based message when the inference server returns no JSON.
      }
      throw new Error(message);
    }
    const result = await response.json() as { reference_audio_path?: string; voice_id?: string; status?: string };
    if (!result.reference_audio_path) {
      throw new Error("El motor recibió la muestra, pero no devolvió la referencia de voz.");
    }
    if (!["trained", "ready"].includes(result.status?.toLowerCase() || "")) {
      await aiInferenceService.waitForVoice(result.voice_id || result.reference_audio_path.replace(/^fish:/, ""));
    }
    return result.reference_audio_path;
  },
};
