import { apiRequest, setCsrfToken } from "../services/api.client.js";
import type { AuthUser, SessionResponse } from "./auth.types.js";

export async function fetchSession(): Promise<SessionResponse> {
  return apiRequest<SessionResponse>("/api/auth/session");
}

export async function fetchCsrf(): Promise<string | null> {
  const data = await apiRequest<{ csrfToken: string | null }>("/api/auth/csrf");
  setCsrfToken(data.csrfToken);
  return data.csrfToken;
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: AuthUser; csrfToken: string }> {
  const data = await apiRequest<{ user: AuthUser; csrfToken: string }>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
  setCsrfToken(data.csrfToken);
  return data;
}

export async function logout(): Promise<void> {
  await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
  setCsrfToken(null);
}
