import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "./AuthContext.js";
import * as authApi from "./auth.api.js";
import type { AuthUser } from "./auth.types.js";
import { ApiError, setSessionToken } from "../services/api.client.js";

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
      if (!session.authenticated) {
        setSessionToken(null);
        setUser(null);
        setMode(null);
        return;
      }
      setUser(session.user);
      setMode(session.mode ?? "session");
      if (session.mode !== "local_dev") {
        await authApi.fetchCsrf();
      }
    } catch (err) {
      setSessionToken(null);
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
    // Bearer sessionToken is stored by authApi.login; verify it works cross-origin.
    const session = await authApi.fetchSession();
    if (!session.authenticated || !session.user) {
      setUser(null);
      setMode(null);
      throw new ApiError(
        "Login succeeded but session could not be restored. Try again.",
        401,
        "SESSION_RESTORE_FAILED",
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
