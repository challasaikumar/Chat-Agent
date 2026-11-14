import { createContext } from "react";
import type { AuthUser } from "./auth.types.js";

export type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  mode: "session" | "local_dev" | null;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
