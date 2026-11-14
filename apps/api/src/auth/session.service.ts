import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { Env } from "../config/env.js";
import type { AuthSession, User } from "../db/schema.js";
import { AuthRepository } from "./auth.repository.js";

export type SessionTokens = {
  sessionId: string;
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
};

export type ValidatedSession = {
  session: AuthSession;
  user: User;
  sessionToken: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "utf8");
    const right = Buffer.from(b, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export class SessionService {
  constructor(
    private readonly env: Env,
    private readonly repo: AuthRepository,
  ) {}

  async createSession(input: {
    userId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<SessionTokens> {
    const sessionToken = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const now = Date.now();
    const idleMs = this.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
    const absoluteMs = this.env.AUTH_SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600_000;
    const expiresAt = new Date(now + idleMs);
    const absoluteExpiresAt = new Date(now + absoluteMs);
    const id = randomUUID();

    await this.repo.insertSession({
      id,
      userId: input.userId,
      tokenHash: hashToken(sessionToken),
      csrfTokenHash: hashToken(csrfToken),
      expiresAt,
      absoluteExpiresAt,
      userAgentHash: input.userAgent
        ? hashToken(input.userAgent).slice(0, 32)
        : null,
      ipAddressHash: input.ipAddress
        ? hashToken(input.ipAddress).slice(0, 32)
        : null,
    });

    return {
      sessionId: id,
      sessionToken,
      csrfToken,
      expiresAt,
      absoluteExpiresAt,
    };
  }

  async validateSessionToken(sessionToken: string | undefined): Promise<ValidatedSession | null> {
    if (!sessionToken) return null;
    const tokenHash = hashToken(sessionToken);
    const session = await this.repo.findSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt) return null;

    const now = Date.now();
    if (
      session.expiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now
    ) {
      await this.repo.revokeSession(session.id);
      return null;
    }

    const user = await this.repo.findUserById(session.userId);
    if (!user || user.status !== "active") return null;

    const idleMs = this.env.AUTH_SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
    const nextExpiry = new Date(
      Math.min(now + idleMs, session.absoluteExpiresAt.getTime()),
    );
    await this.repo.touchSession(session.id, nextExpiry);

    return { session, user, sessionToken };
  }

  async rotateSession(input: {
    previousSessionId: string;
    userId: string;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<SessionTokens> {
    await this.repo.revokeSession(input.previousSessionId, input.userId);
    return this.createSession(input);
  }

  validateCsrf(session: AuthSession, csrfToken: string | undefined): boolean {
    if (!csrfToken) return false;
    return safeEqualHex(session.csrfTokenHash, hashToken(csrfToken));
  }

  async issueCsrfToken(sessionId: string): Promise<string> {
    const csrfToken = randomBytes(32).toString("base64url");
    await this.repo.updateCsrfHash(sessionId, hashToken(csrfToken));
    return csrfToken;
  }

  async revoke(sessionId: string, userId: string): Promise<boolean> {
    return this.repo.revokeSession(sessionId, userId);
  }

  async revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    return this.repo.revokeAllForUser(userId, exceptSessionId);
  }

  async listForUser(userId: string): Promise<AuthSession[]> {
    return this.repo.listSessionsForUser(userId);
  }

  async cleanupExpired(): Promise<number> {
    return this.repo.deleteExpiredSessions();
  }
}
