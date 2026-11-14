export type Role = "admin" | "user";

export type Permission =
  | "profile:read"
  | "profile:write"
  | "conversation:own"
  | "memory:own"
  | "research:own"
  | "evidence:own"
  | "agent:own"
  | "session:own"
  | "account:export"
  | "account:delete"
  | "admin:provision"
  | "admin:revoke"
  | "admin:sessions";

const USER_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "profile:read",
  "profile:write",
  "conversation:own",
  "memory:own",
  "research:own",
  "evidence:own",
  "agent:own",
  "session:own",
  "account:export",
  "account:delete",
]);

const ADMIN_PERMISSIONS: ReadonlySet<Permission> = new Set([
  ...USER_PERMISSIONS,
  "admin:provision",
  "admin:revoke",
  "admin:sessions",
]);

/**
 * Admin does NOT get automatic access to other users' private conversation content.
 * Cross-user content access requires an explicit, logged exception (none by default).
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === "admin") return ADMIN_PERMISSIONS.has(permission);
  return USER_PERMISSIONS.has(permission);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    const error = new Error("Forbidden");
    (error as Error & { statusCode: number; code: string }).statusCode = 403;
    (error as Error & { statusCode: number; code: string }).code = "FORBIDDEN";
    throw error;
  }
}
