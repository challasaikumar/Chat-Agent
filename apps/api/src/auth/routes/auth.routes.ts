import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import {
  changePasswordSchema,
  loginSchema,
  sessionIdParamsSchema,
} from "../auth.schemas.js";
import {
  clearSessionCookie,
  getRequestUserId,
  setSessionCookie,
} from "../auth.middleware.js";
import { badRequest } from "../../utils/errors.js";
import { serializeDates } from "../../utils/serialize.js";

function parseOrThrow<T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false; error: unknown } },
  data: unknown,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error);
  }
  return parsed.data;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const auth = app.authService;

  app.post("/api/auth/login", async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body ?? {});
    const result = await auth.login({
      email: body.email,
      password: body.password,
      userAgent: request.headers["user-agent"] ?? null,
      ipAddress: request.ip,
      requestId: request.id,
    });

    setSessionCookie(
      reply,
      app.env,
      result.tokens.sessionToken,
      result.tokens.absoluteExpiresAt,
    );

    return ok({
      user: serializeDates(result.user),
      csrfToken: result.tokens.csrfToken,
      expiresAt: result.tokens.expiresAt.toISOString(),
    });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.auth?.session) {
      await auth.sessions.revoke(request.auth.session.id, request.auth.user.id);
      await auth.audit.record({
        actorUserId: request.auth.user.id,
        action: "auth.logout",
        result: "success",
        resourceType: "session",
        resourceId: request.auth.session.id,
        requestId: request.id,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
    }
    clearSessionCookie(reply, app.env);
    return ok({ loggedOut: true });
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    const userId = getRequestUserId(request);
    const count = await auth.sessions.revokeAll(userId);
    await auth.audit.record({
      actorUserId: userId,
      action: "auth.logout_all",
      result: "success",
      requestId: request.id,
      metadata: { revoked: count },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    clearSessionCookie(reply, app.env);
    return ok({ revoked: count });
  });

  app.get("/api/auth/session", async (request) => {
    if (!request.auth?.user) {
      return ok({ authenticated: false, user: null });
    }
    return ok({
      authenticated: true,
      user: serializeDates(auth.publicUser(request.auth.user)),
      mode: request.auth.mode,
      sessionId: request.auth.session?.id ?? null,
    });
  });

  app.get("/api/auth/me", async (request) => {
    const userId = getRequestUserId(request);
    const user = await auth.repo.findUserById(userId);
    if (!user) {
      throw badRequest("User not found");
    }
    return ok(serializeDates(auth.publicUser(user)));
  });

  app.get("/api/auth/csrf", async (request) => {
    if (app.env.AUTH_MODE === "local_dev") {
      return ok({ csrfToken: null, mode: "local_dev" });
    }
    if (!request.auth?.session) {
      return ok({ csrfToken: null, authenticated: false });
    }
    const csrfToken = await auth.sessions.issueCsrfToken(request.auth.session.id);
    return ok({ csrfToken, authenticated: true });
  });

  app.post("/api/auth/change-password", async (request) => {
    const userId = getRequestUserId(request);
    const body = parseOrThrow(changePasswordSchema, request.body ?? {});
    const user = await auth.repo.findUserById(userId);
    if (!user || !request.auth?.session) {
      throw badRequest("Session required");
    }
    await auth.changePassword({
      user,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      sessionId: request.auth.session.id,
      requestId: request.id,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });
    return ok({ changed: true });
  });

  app.get("/api/auth/sessions", async (request) => {
    const userId = getRequestUserId(request);
    const sessions = (await auth.sessions.listForUser(userId)).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      current: request.auth?.session?.id === session.id,
    }));
    return ok({ items: serializeDates(sessions) });
  });

  app.delete("/api/auth/sessions/:id", async (request) => {
    const userId = getRequestUserId(request);
    const { id } = parseOrThrow(sessionIdParamsSchema, request.params);
    const revoked = await auth.sessions.revoke(id, userId);
    if (!revoked) {
      throw badRequest("Session not found");
    }
    await auth.audit.record({
      actorUserId: userId,
      action: "auth.session_revoke",
      result: "success",
      resourceType: "session",
      resourceId: id,
      requestId: request.id,
    });
    return ok({ revoked: true });
  });
}
