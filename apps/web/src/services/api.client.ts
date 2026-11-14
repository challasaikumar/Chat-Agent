import type { ApiResponse } from "@minimi/shared";

/** Empty in local/dev (Vite proxies /api). Set to Render API origin in Vercel. */
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

const SESSION_TOKEN_KEY = "minimi.sessionToken";

let csrfToken: string | null = null;
let sessionToken: string | null = readStoredSessionToken();

function readStoredSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export function getSessionToken(): string | null {
  return sessionToken ?? readStoredSessionToken();
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

  const bearer = getSessionToken();
  if (bearer && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${bearer}`;
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
    if (response.status === 401) {
      setSessionToken(null);
      setCsrfToken(null);
    }
    throw new ApiError(
      errorBody?.message ?? `Request failed (${response.status})`,
      response.status,
      errorBody?.code,
      errorBody?.details,
    );
  }

  return body.data;
}
