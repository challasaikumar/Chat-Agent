import type { ApiResponse } from "@minimi/shared";

/** Empty in local/dev (Vite proxies /api). Same-origin on Vercel via rewrite. */
export const API_BASE = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/$/, "") ?? "";

const SESSION_TOKEN_KEY = "minimi.sessionToken";
const CSRF_TOKEN_KEY = "minimi.csrfToken";

let csrfToken: string | null = readStoredCsrfToken();
let sessionToken: string | null = readStoredSessionToken();
let csrfFetchInFlight: Promise<string | null> | null = null;

function readStoredSessionToken(): string | null {
  try {
    return (
      localStorage.getItem(SESSION_TOKEN_KEY) ??
      sessionStorage.getItem(SESSION_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

function readStoredCsrfToken(): string | null {
  try {
    return (
      localStorage.getItem(CSRF_TOKEN_KEY) ??
      sessionStorage.getItem(CSRF_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token && token.trim() ? token.trim() : null;
  try {
    if (csrfToken) {
      localStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
      sessionStorage.setItem(CSRF_TOKEN_KEY, csrfToken);
    } else {
      localStorage.removeItem(CSRF_TOKEN_KEY);
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function getCsrfToken(): string | null {
  if (csrfToken) return csrfToken;
  const stored = readStoredCsrfToken();
  if (stored) csrfToken = stored;
  return csrfToken;
}

export function setSessionToken(token: string | null): void {
  sessionToken = token && token.trim() ? token.trim() : null;
  try {
    if (sessionToken) {
      localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
      sessionStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    } else {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function getSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  const stored = readStoredSessionToken();
  if (stored) sessionToken = stored;
  return sessionToken;
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

async function refreshCsrfFromApi(): Promise<string | null> {
  if (csrfFetchInFlight) return csrfFetchInFlight;

  csrfFetchInFlight = (async () => {
    try {
      const bearer = getSessionToken();
      const headers: Record<string, string> = {};
      if (bearer) {
        headers.authorization = `Bearer ${bearer}`;
        headers["x-minimi-session"] = bearer;
      }
      const response = await fetch(`${API_BASE}/api/auth/csrf`, {
        method: "GET",
        credentials: "include",
        headers,
      });
      const body = (await response.json()) as ApiResponse<{
        csrfToken: string | null;
      }>;
      if (response.ok && body.success) {
        setCsrfToken(body.data.csrfToken);
        return body.data.csrfToken;
      }
      return null;
    } catch {
      return null;
    } finally {
      csrfFetchInFlight = null;
    }
  })();

  return csrfFetchInFlight;
}

export async function ensureCsrfToken(): Promise<string | null> {
  const existing = getCsrfToken();
  if (existing) return existing;
  return refreshCsrfFromApi();
}

type ApiRequestOptions = RequestInit & { csrfRetry?: boolean };

export async function apiRequest<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const hasBody = init.body !== undefined && init.body !== null;
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  if (hasBody && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = "application/json";
  }

  const bearer = getSessionToken();
  if (bearer) {
    if (!headers.authorization && !headers.Authorization) {
      headers.authorization = `Bearer ${bearer}`;
    }
    if (!headers["x-minimi-session"]) {
      headers["x-minimi-session"] = bearer;
    }
  }

  const needsCsrf =
    method !== "GET" && method !== "HEAD" && method !== "OPTIONS";

  if (needsCsrf) {
    const token = await ensureCsrfToken();
    if (token) headers["x-csrf-token"] = token;
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

    if (
      needsCsrf &&
      !init.csrfRetry &&
      response.status === 403 &&
      errorBody?.code === "CSRF_REJECTED"
    ) {
      setCsrfToken(null);
      await refreshCsrfFromApi();
      return apiRequest<T>(path, { ...init, csrfRetry: true });
    }

    if (
      response.status === 401 &&
      errorBody?.code !== "AUTH_FAILED" &&
      path !== "/api/auth/login"
    ) {
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
