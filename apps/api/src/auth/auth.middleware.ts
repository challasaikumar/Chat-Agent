import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";
import type { User } from "../db/schema.js";
import { AppError } from "../utils/errors.js";
import type { AuthService } from "./auth.service.js";
import type { AuthSession } from "../db/schema.js";
import { isOriginAllowed } from "../security/origin-allowlist.js";

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

function extractBearerToken(
  authorization: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(authorization)
    ? authorization[0]
    : authorization;
  if (!header || typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token || undefined;
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

function sessionCookieOptions(env: Env): {
  path: string;
  httpOnly: boolean;
  sameSite: "lax" | "none";
  secure: boolean;
  partitioned?: boolean;
} {
  // __Host- cookies are same-origin only and force SameSite=Lax — unusable when
  // the UI is on Vercel and the API is on Render. Prefer a normal cookie name.
  const hostPrefixed = env.AUTH_COOKIE_NAME.startsWith("__Host-");
  const crossSite = env.NODE_ENV === "production" && !hostPrefixed;
  return {
    path: "/",
    httpOnly: true,
    // Third-party (cross-site) credentialed fetches need None + Secure.
    // Partitioned (CHIPS) keeps the cookie allowed under browser 3P restrictions.
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || env.NODE_ENV === "production" || hostPrefixed,
    ...(crossSite ? { partitioned: true } : {}),
  };
}

export function setSessionCookie(
  reply: FastifyReply,
  env: Env,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(env.AUTH_COOKIE_NAME, token, {
    ...sessionCookieOptions(env),
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(env.AUTH_COOKIE_NAME, sessionCookieOptions(env));
}

export async function registerAuthMiddleware(
  app: FastifyInstance,
  authService: AuthService,
): Promise<void> {
  app.decorate("authService", authService);
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?")[0] ?? request.url;

    // Origin allowlist for credentialed browser requests.
    // Skip OPTIONS so @fastify/cors can answer preflight with the right headers.
    const origin = request.headers.origin;
    if (
      origin &&
      typeof origin === "string" &&
      request.method !== "OPTIONS"
    ) {
      if (!isOriginAllowed(origin, app.env.APP_ALLOWED_ORIGINS)) {
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

    // Prefer Authorization Bearer (cross-origin UIs where cookies are blocked),
    // then fall back to the httpOnly session cookie (same-origin / local).
    const bearerToken = extractBearerToken(request.headers.authorization);
    const rawCookie = request.cookies?.[app.env.AUTH_COOKIE_NAME];
    const validated = await authService.sessions.validateSessionToken(
      bearerToken ?? rawCookie,
    );
    const authenticatedViaBearer = Boolean(bearerToken && validated);

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

    // CSRF protects cookie-based sessions. Bearer tokens are not sent
    // automatically by the browser, so CSRF is not required for them.
    if (
      !isSafeMethod(request.method) &&
      request.auth.session &&
      !authenticatedViaBearer
    ) {
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
