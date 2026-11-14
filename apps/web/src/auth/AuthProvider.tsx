import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "./AuthContext.js";
import * as authApi from "./auth.api.js";
import type { AuthUser } from "./auth.types.js";
import { ApiError, getSessionToken, setSessionToken } from "../services/api.client.js";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"session" | "local_dev" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await authApi.fetchSession();
      if (!session.authenticated || !session.user) {
        if (getSessionToken()) {
          setSessionToken(null);
        }
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

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      setSigningIn(true);
      try {
        const result = await authApi.login(email, password);
        clearChatSessionKeys();

        // Token is already stored. Confirm via /session when possible; otherwise
        // admit the login payload so a flaky public session read cannot block entry.
        try {
          const session = await authApi.fetchSession();
          if (session.authenticated && session.user) {
            setUser(session.user);
            setMode(session.mode ?? "session");
            if (session.mode !== "local_dev") {
              await authApi.fetchCsrf();
            }
            return;
          }
        } catch {
          // Fall through — Bearer/x-minimi-session will authenticate API calls.
        }

        setUser(result.user);
        setMode("session");
      } finally {
        setSigningIn(false);
      }
    },
    [clearChatSessionKeys],
  );

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
    () => ({
      user,
      loading: loading || signingIn,
      mode,
      error,
      login,
      logout,
      refresh,
    }),
    [user, loading, signingIn, mode, error, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
