import type { ApiResponse } from "@minimi/shared";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body !== undefined && init.body !== null;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  // Fastify rejects empty bodies when content-type is application/json.
  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  if (
    csrfToken &&
    method !== "GET" &&
    method !== "HEAD" &&
    method !== "OPTIONS"
  ) {
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    method,
    credentials: "include",
    headers,
  });

  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  if (!response.ok || !body || body.success === false) {
    const errorBody = body && body.success === false ? body.error : null;
    throw new ApiError(
      errorBody?.message ?? `Request failed (${response.status})`,
      response.status,
      errorBody?.code,
      errorBody?.details,
    );
  }

  return body.data;
}
