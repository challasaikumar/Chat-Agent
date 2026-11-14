import type { Env } from "../config/env.js";
import type { User } from "../db/schema.js";
import { AppError, badRequest } from "../utils/errors.js";
import { AuditService } from "../security/audit.service.js";
import { AuthRepository } from "./auth.repository.js";
import { normalizeEmail } from "./auth.schemas.js";
import { PasswordService } from "./password.service.js";
import { SessionService, type SessionTokens } from "./session.service.js";

const TIMING_PAD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export class AuthService {
  readonly passwords: PasswordService;
  readonly sessions: SessionService;
  readonly repo: AuthRepository;
  readonly audit: AuditService;

  constructor(
    private readonly env: Env,
    repo: AuthRepository,
    audit: AuditService,
  ) {
    this.repo = repo;
    this.audit = audit;
    this.passwords = new PasswordService(env);
    this.sessions = new SessionService(env, repo);
  }

  publicUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  async login(input: {
    email: string;
    password: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    requestId?: string | null;
  }): Promise<{ user: ReturnType<AuthService["publicUser"]>; tokens: SessionTokens }> {
    const user = await this.repo.findUserByEmail(input.email);
    const fail = async () => {
      await this.audit.record({
        actorUserId: user?.id ?? null,
        action: "auth.login",
        result: "failure",
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { email: normalizeEmail(input.email) },
      });
      throw new AppError("Invalid email or password", {
        statusCode: 401,
        code: "AUTH_FAILED",
      });
    };

    if (!user || !user.passwordHash || user.status !== "active") {
      await this.passwords.verify(TIMING_PAD_HASH, input.password);
      await fail();
    }

    const ok = await this.passwords.verify(user!.passwordHash!, input.password);
    if (!ok) await fail();

    if (this.passwords.needsRehash(user!.passwordHash!)) {
      const next = await this.passwords.hash(input.password);
      await this.repo.updatePassword(user!.id, next);
    }

    const tokens = await this.sessions.createSession({
      userId: user!.id,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
    await this.repo.touchLogin(user!.id);
    await this.audit.record({
      actorUserId: user!.id,
      action: "auth.login",
      result: "success",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      resourceType: "session",
      resourceId: tokens.sessionId,
    });

    return { user: this.publicUser(user!), tokens };
  }

  async changePassword(input: {
    user: User;
    currentPassword: string;
    newPassword: string;
    sessionId: string;
    requestId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    if (!input.user.passwordHash) {
      throw badRequest("Password authentication is not configured for this account");
    }
    const ok = await this.passwords.verify(
      input.user.passwordHash,
      input.currentPassword,
    );
    if (!ok) {
      await this.audit.record({
        actorUserId: input.user.id,
        action: "auth.change_password",
        result: "failure",
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      throw new AppError("Current password is incorrect", {
        statusCode: 401,
        code: "AUTH_FAILED",
      });
    }

    const hash = await this.passwords.hash(input.newPassword);
    await this.repo.updatePassword(input.user.id, hash);
    await this.sessions.revokeAll(input.user.id, input.sessionId);
    await this.audit.record({
      actorUserId: input.user.id,
      action: "auth.change_password",
      result: "success",
      requestId: input.requestId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  }

  async bootstrapAdmin(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<User> {
    if (await this.repo.countAdmins() > 0) {
      throw badRequest("An administrator already exists");
    }
    if (await this.repo.findUserByEmail(input.email)) {
      throw badRequest("A user with this email already exists");
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repo.createUser({
      email: input.email,
      displayName: input.displayName ?? "Administrator",
      passwordHash,
      role: "admin",
    });
    await this.audit.record({
      actorUserId: user.id,
      action: "admin.bootstrap",
      result: "success",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: normalizeEmail(input.email) },
    });
    return user;
  }

  async provisionUser(input: {
    email: string;
    password: string;
    displayName: string;
    role: "admin" | "user";
    actorUserId: string;
  }): Promise<User> {
    if (this.env.AUTH_REGISTRATION_MODE === "disabled" && input.role === "user") {
      // Still allow admin CLI provisioning; public registration remains disabled.
    }
    if (await this.repo.findUserByEmail(input.email)) {
      throw badRequest("A user with this email already exists");
    }
    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.repo.createUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      role: input.role,
    });
    await this.audit.record({
      actorUserId: input.actorUserId,
      action: "admin.provision",
      result: "success",
      resourceType: "user",
      resourceId: user.id,
      metadata: { email: normalizeEmail(input.email), role: input.role },
    });
    return user;
  }
}
