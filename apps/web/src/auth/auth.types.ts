export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type SessionResponse = {
  authenticated: boolean;
  user: AuthUser | null;
  mode?: "session" | "local_dev";
  sessionId?: string | null;
};
