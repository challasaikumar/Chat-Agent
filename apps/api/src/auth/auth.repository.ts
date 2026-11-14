import { and, eq, isNull, lt, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  authSessions,
  users,
  type AuthSession,
  type User,
} from "../db/schema.js";
import { normalizeEmail } from "./auth.schemas.js";

export class AuthRepository {
  constructor(private readonly db: AppDatabase) {}

  async findUserById(id: string): Promise<User | undefined> {
    return (await this.db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const normalized = normalizeEmail(email);
    return (await this.db
      .select()
      .from(users)
      .where(eq(users.emailNormalized, normalized)).limit(1))[0];
  }

  async createUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role: "admin" | "user";
  }): Promise<User> {
    const now = new Date();
    const id = randomUUID();
    const normalized = normalizeEmail(input.email);
    await this.db
      .insert(users)
      .values({
        id,
        displayName: input.displayName,
        email: input.email.trim(),
        emailNormalized: normalized,
        passwordHash: input.passwordHash,
        role: input.role,
        status: "active",
        passwordUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    return (await this.findUserById(id))!;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(users)
      .set({
        passwordHash,
        passwordUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
  }

  async touchLogin(userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(users)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async countAdmins(): Promise<number> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));
    return rows.length;
  }

  async insertSession(row: {
    id: string;
    userId: string;
    tokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    userAgentHash: string | null;
    ipAddressHash: string | null;
  }): Promise<AuthSession> {
    const now = new Date();
    await this.db
      .insert(authSessions)
      .values({
        id: row.id,
        userId: row.userId,
        tokenHash: row.tokenHash,
        csrfTokenHash: row.csrfTokenHash,
        createdAt: now,
        lastActivityAt: now,
        expiresAt: row.expiresAt,
        absoluteExpiresAt: row.absoluteExpiresAt,
        revokedAt: null,
        userAgentHash: row.userAgentHash,
        ipAddressHash: row.ipAddressHash,
        sessionMetadata: null,
      });
    return (await this.findSessionById(row.id))!;
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    return (await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash)).limit(1))[0];
  }

  async findSessionById(id: string): Promise<AuthSession | undefined> {
    return (await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, id)).limit(1))[0];
  }

  async listSessionsForUser(userId: string): Promise<AuthSession[]> {
    return await this.db
      .select()
      .from(authSessions)
      .where(
        and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)),
      );
  }

  async touchSession(id: string, expiresAt: Date): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ lastActivityAt: new Date(), expiresAt })
      .where(eq(authSessions.id, id));
  }

  async updateCsrfHash(id: string, csrfTokenHash: string): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ csrfTokenHash })
      .where(eq(authSessions.id, id));
  }

  async revokeSession(id: string, userId?: string): Promise<boolean> {
    const now = new Date();
    const where = userId
      ? and(eq(authSessions.id, id), eq(authSessions.userId, userId))
      : eq(authSessions.id, id);
    const result = await this.db
      .update(authSessions)
      .set({ revokedAt: now })
      .where(where)
      .returning({ id: authSessions.id });
    return result.length > 0;
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    const now = new Date();
    const sessions = await this.listSessionsForUser(userId);
    let count = 0;
    for (const session of sessions) {
      if (exceptSessionId && session.id === exceptSessionId) continue;
      await this.db
        .update(authSessions)
        .set({ revokedAt: now })
        .where(eq(authSessions.id, session.id));
      count += 1;
    }
    return count;
  }

  async deleteExpiredSessions(now = new Date()): Promise<number> {
    const result = await this.db
      .delete(authSessions)
      .where(
        or(
          lt(authSessions.expiresAt, now),
          lt(authSessions.absoluteExpiresAt, now),
        ),
      )
      .returning({ id: authSessions.id });
    return result.length;
  }
}
