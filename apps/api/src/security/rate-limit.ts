import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

/**
 * In-memory rate limits — single-process only.
 * Do not claim cross-process or distributed protection.
 */
export async function registerRateLimits(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    max: 200,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      if (request.auth?.user?.id) return `user:${request.auth.user.id}`;
      return `ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests",
      },
    }),
  });

  app.addHook("onRoute", (routeOptions) => {
    const path = routeOptions.url;
    if (path === "/api/auth/login") {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: app.env.AUTH_LOGIN_RATE_LIMIT_MAX,
          timeWindow: app.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
          keyGenerator: (request) => `login:${request.ip}`,
        },
      };
    }
    if (
      path === "/api/agent/turn" ||
      path === "/api/agent/turn/stream" ||
      path === "/api/research/search"
    ) {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      };
    }
    if (path === "/api/account/export" || path === "/api/account/data") {
      routeOptions.config = {
        ...routeOptions.config,
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      };
    }
  });
}
