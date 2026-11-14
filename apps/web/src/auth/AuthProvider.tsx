import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "./AuthContext.js";
import * as authApi from "./auth.api.js";
import type { AuthUser } from "./auth.types.js";
import { ApiError } from "../services/api.client.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"session" | "local_dev" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await authApi.fetchSession();
      setUser(session.user);
      setMode(session.mode ?? (session.authenticated ? "session" : null));
      if (session.authenticated && session.mode !== "local_dev") {
        await authApi.fetchCsrf();
      }
    } catch (err) {
      setUser(null);
      setMode(null);
      setError(err instanceof ApiError ? err.message : "Session check failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const clearChatSessionKeys = useCallback(() => {
    try {
      localStorage.removeItem("minimi.activeConversationId");
      const draftKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith("minimi.draft.")) {
          draftKeys.push(key);
        }
      }
      for (const key of draftKeys) {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const result = await authApi.login(email, password);
    // Switching accounts must not reuse another user's conversation ids.
    clearChatSessionKeys();
    setUser(result.user);
    setMode("session");
    // Confirm the session cookie is actually accepted cross-origin.
    const session = await authApi.fetchSession();
    if (!session.authenticated || !session.user) {
      setUser(null);
      setMode(null);
      throw new ApiError(
        "Signed in on the server, but the browser blocked the session cookie. Use AUTH_COOKIE_NAME=minimi_session on the API and allow third-party cookies, or host UI and API on the same site.",
        401,
        "SESSION_COOKIE_BLOCKED",
      );
    }
    setUser(session.user);
    if (session.mode !== "local_dev") {
      await authApi.fetchCsrf();
    }
  }, [clearChatSessionKeys]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearChatSessionKeys();
      setUser(null);
      setMode(null);
    }
  }, [clearChatSessionKeys]);

  const value = useMemo(
    () => ({ user, loading, mode, error, login, logout, refresh }),
    [user, loading, mode, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
