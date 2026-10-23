const API_BASE_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:8081/api";
import { readAccessToken, clearAuthSession } from "../lib/authStorage";

export interface ApiResponse<T> {
  message: string;
  data: T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Accept", "application/json");
  const accessToken = readAccessToken();
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch {
      errorData = { message: response.statusText };
    }
    if (response.status === 401 && accessToken) {
      clearAuthSession();
      window.dispatchEvent(new Event("pseudovoice:auth-expired"));
    }
    throw new ApiError(
      response.status,
      errorData.message || `Error HTTP ${response.status}`,
      errorData
    );
  }

  // 204 No Content
  if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())
      && /^\/(memory-settings|memory-groups|character-rules|rules|characters)(\/|$)/.test(endpoint)) {
    window.dispatchEvent(new Event("pseudovoice:context-changed"));
  }
  if (response.status === 204) {
    return {} as T;
  }

  const json: ApiResponse<T> | T = await response.json();
  return json && typeof json === "object" && "data" in json ? json.data : json as T;
}
