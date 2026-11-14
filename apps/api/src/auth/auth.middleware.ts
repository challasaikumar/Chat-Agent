import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import type { User } from "../db/schema.js";
import { AppError } from "../utils/errors.js";
import type { AuthService } from "./auth.service.js";
import type { AuthSession } from "../db/schema.js";

export type AuthContext = {
  user: User;
  session: AuthSession | null;
  csrfToken: string | null;
  mode: "session" | "local_dev";
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    authService: AuthService;
  }
}

const PUBLIC_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/csrf",
  "/api/auth/session",
]);

const PUBLIC_PREFIXES = ["/api/health"];

function isPublicPath(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function getRequestUserId(request: FastifyRequest): string {
  if (!request.auth?.user) {
    throw new AppError("Authentication required", {
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  }
  return request.auth.user.id;
}

export function setSessionCookie(
  reply: FastifyReply,
  env: Env,
  token: string,
  expiresAt: Date,
): void {
  const secure =
    env.NODE_ENV === "production" || env.AUTH_COOKIE_NAME.startsWith("__Host-");
  reply.setCookie(env.AUTH_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  const secure =
    env.NODE_ENV === "production" || env.AUTH_COOKIE_NAME.startsWith("__Host-");
  reply.clearCookie(env.AUTH_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
  });
}

export async function registerAuthMiddleware(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.decorate("authService", authService);
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;

    // Origin allowlist for credentialed browser requests
    const origin = request.headers.origin;
    if (origin && typeof origin === "string") {
      if (!app.env.APP_ALLOWED_ORIGINS.includes(origin)) {
        if (!isPublicPath(path) || request.method !== "GET") {
          throw new AppError("Origin not allowed", {
            statusCode: 403,
            code: "ORIGIN_FORBIDDEN",
          });
        }
      }
    }

    if (app.env.AUTH_MODE === "local_dev") {
      const user = await authService.repo.findUserById(app.localUserId);
      if (!user) {
        throw new AppError("Local development user missing", {
          statusCode: 500,
          code: "LOCAL_USER_MISSING",
        });
      }
      request.auth = {
        user,
        session: null,
        csrfToken: null,
        mode: "local_dev",
      };
      return;
    }

    const rawCookie = request.cookies?.[app.env.AUTH_COOKIE_NAME];
    const validated = await authService.sessions.validateSessionToken(rawCookie);

    if (validated) {
      request.auth = {
        user: validated.user,
        session: validated.session,
        csrfToken: null,
        mode: "session",
      };
    } else {
      request.auth = null;
    }

    // Allow unauthenticated logout to clear a stale cookie without CSRF.
    if (path === "/api/auth/logout" && !request.auth) {
      return;
    }

    if (isPublicPath(path)) {
      return;
    }

    if (!request.auth) {
      throw new AppError("Authentication required", {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    // CSRF for state-changing authenticated requests in session mode
    if (!isSafeMethod(request.method) && request.auth.session) {
      const headerName = app.env.AUTH_CSRF_HEADER.toLowerCase();
      const csrfHeader = request.headers[headerName];
      const csrfToken = Array.isArray(csrfHeader)
        ? csrfHeader[0]
        : csrfHeader;
      if (
        !authService.sessions.validateCsrf(
          request.auth.session,
          typeof csrfToken === "string" ? csrfToken : undefined,
        )
      ) {
        await authService.audit.record({
          actorUserId: request.auth.user.id,
          action: "security.csrf_rejected",
          result: "denied",
          requestId: request.id,
        });
        throw new AppError("CSRF validation failed", {
          statusCode: 403,
          code: "CSRF_REJECTED",
        });
      }
    }

    // Prevent caching of authenticated API responses
    void reply.header("Cache-Control", "no-store");
  });
}
