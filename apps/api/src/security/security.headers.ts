import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

export async function registerSecurityHeaders(
  app: FastifyInstance,
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", ...app.env.APP_ALLOWED_ORIGINS],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
    hsts:
      app.env.NODE_ENV === "production"
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
  });
}
