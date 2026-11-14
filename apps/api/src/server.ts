import { sql } from "drizzle-orm";
import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";
import { DatabaseConfigError, getDefaultDatabase } from "./db/index.js";
import {
  startAcceptingTraffic,
  stopAcceptingTraffic,
} from "./performance/readiness.js";
import { getMetricsRegistry } from "./performance/metrics.registry.js";
import { loadPerfConfig } from "./performance/perf.config.js";

async function start(): Promise<void> {
  let database: ReturnType<typeof getDefaultDatabase>;
  try {
    database = getDefaultDatabase();
    await applyMigrations(database);
  } catch (error) {
    console.error(
      error instanceof DatabaseConfigError
        ? `\nStartup aborted: ${error.message}\n`
        : error,
    );
    process.exit(1);
  }

  const app = await buildApp();
  const perf = loadPerfConfig(env);
  const metrics = getMetricsRegistry(perf);
  startAcceptingTraffic();

  try {
    await app.db.execute(sql`SELECT 1`);
    app.log.info(
      { database: database.path },
      "Database connected",
    );
    app.log.info(
      {
        authMode: env.AUTH_MODE,
        timeZone: env.APP_TIME_ZONE,
        localUserId:
          env.AUTH_MODE === "local_dev" ? env.LOCAL_USER_ID : undefined,
      },
      "Runtime identity mode",
    );
  } catch (error) {
    app.log.error({ err: error }, "Database connection failed");
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopAcceptingTraffic();
    app.log.info({ signal }, "Shutting down — readiness false, draining");

    const drainMs = Math.min(10_000, perf.defaultRequestTimeoutMs);
    const deadline = Date.now() + drainMs;
    while (
      Date.now() < deadline &&
      (metrics.activeAgentRuns > 0 || metrics.activeStreams > 0)
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }

    try {
      await app.close();
      metrics.disable();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  const host = env.API_HOST;
  try {
    await app.listen({ port: env.API_PORT, host });
    app.log.info(`API listening on http://${host}:${env.API_PORT}`);
  } catch (error) {
    app.log.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

void start();
