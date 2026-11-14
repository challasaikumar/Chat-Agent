import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { env as defaultEnv, type Env } from "./config/env.js";
import {
  registerDatabase,
  type DatabasePluginOptions,
} from "./plugins/database.js";
import { healthRoutes } from "./routes/health.routes.js";
import { conversationRoutes } from "./routes/conversation.routes.js";
import { memoryRoutes } from "./routes/memory.routes.js";
import { researchRoutes } from "./routes/research.routes.js";
import { agentRoutes } from "./routes/agent.routes.js";
import { temporalRoutes } from "./routes/temporal.routes.js";
import { evidenceRoutes } from "./routes/evidence.routes.js";
import { authRoutes } from "./auth/routes/auth.routes.js";
import { accountRoutes } from "./privacy/account.routes.js";
import { registerAuthMiddleware } from "./auth/auth.middleware.js";
import { AuthRepository } from "./auth/auth.repository.js";
import { AuthService } from "./auth/auth.service.js";
import { AuditService } from "./security/audit.service.js";
import { registerCors } from "./security/cors.config.js";
import { registerSecurityHeaders } from "./security/security.headers.js";
import { registerRateLimits } from "./security/rate-limit.js";
import { redactSecrets } from "./security/secret-redactor.js";
import { errorHandler, notFound } from "./utils/errors.js";
import type { MemoryExtractor } from "./memory/memory-extractor.interface.js";
import type { SearchProvider } from "./search/search.interface.js";
import type { ResponsesClient } from "./agent/openai/responses.client.js";

export type BuildAppOptions = {
  env?: Env;
  database?: DatabasePluginOptions;
  memoryExtractor?: MemoryExtractor;
  searchProvider?: SearchProvider;
  responsesClient?: ResponsesClient;
};

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    memoryExtractor?: MemoryExtractor;
    searchProvider?: SearchProvider;
    responsesClient?: ResponsesClient;
  }
}

export async function buildApp(options: BuildAppOptions = {}) {
  const runtimeEnv = options.env ?? defaultEnv;

  const app = Fastify({
    logger: {
      level: runtimeEnv.NODE_ENV === "production" ? "info" : "debug",
    },
    bodyLimit: 1_048_576,
    // Required behind Render / other reverse proxies so Secure cookies and client IPs work.
    trustProxy: runtimeEnv.NODE_ENV === "production",
  });

  app.decorate("env", runtimeEnv);
  if (options.memoryExtractor) {
    app.decorate("memoryExtractor", options.memoryExtractor);
  }
  if (options.searchProvider) {
    app.decorate("searchProvider", options.searchProvider);
  }
  if (options.responsesClient) {
    app.decorate("responsesClient", options.responsesClient);
  }

  app.addHook("onRequest", async (request) => {
    // Redact secrets from any accidental log serialization of headers.
    if (request.headers.authorization) {
      request.headers.authorization = redactSecrets(
        String(request.headers.authorization),
      );
    }
  });

  app.setErrorHandler(errorHandler);

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: notFound().message,
      },
    });
  });

  await app.register(cookie);
  await registerCors(app);
  await registerSecurityHeaders(app);
  await registerDatabase(app, options.database ?? {});

  const authService = new AuthService(
    runtimeEnv,
    new AuthRepository(app.db),
    new AuditService(app.db),
  );
  await registerAuthMiddleware(app, authService);
  await registerRateLimits(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(conversationRoutes);
  await app.register(memoryRoutes);
  await app.register(researchRoutes);
  await app.register(agentRoutes);
  await app.register(temporalRoutes);
  await app.register(evidenceRoutes);

  return app;
}
