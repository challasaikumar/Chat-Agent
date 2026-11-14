import type { AppDatabase } from "./index.js";
import { users } from "./schema.js";

/**
 * Ensures a local development / test user exists.
 * Production must use AUTH_MODE=session and bootstrap provisioning instead.
 */
export async function ensureLocalUser(
  db: AppDatabase,
  localUserId: string,
  displayName = "Local Developer",
): Promise<void> {
  const now = new Date();
  await db
    .insert(users)
    .values({
      id: localUserId,
      displayName,
      email: null,
      emailNormalized: null,
      passwordHash: null,
      role: "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: users.id });
}
