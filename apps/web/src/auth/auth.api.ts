import {
  apiRequest,
  getSessionToken,
  setCsrfToken,
  setSessionToken,
} from "../services/api.client.js";
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
): Promise<{ user: AuthUser; csrfToken: string; sessionToken: string }> {
  const data = await apiRequest<{
    user: AuthUser;
    csrfToken: string;
    sessionToken?: string;
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!data.sessionToken) {
    throw new Error(
      "API did not return sessionToken. Redeploy the Render backend from latest main.",
    );
  }

  setSessionToken(data.sessionToken);
  setCsrfToken(data.csrfToken);

  // Confirm the token is readable before continuing.
  if (!getSessionToken()) {
    throw new Error(
      "Could not persist session token in the browser (storage blocked).",
    );
  }

  return {
    user: data.user,
    csrfToken: data.csrfToken,
    sessionToken: data.sessionToken,
  };
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } finally {
    setSessionToken(null);
    setCsrfToken(null);
  }
}
