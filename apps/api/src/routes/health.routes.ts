import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { ok } from "@minimi/shared";
import type {
  DatabaseHealthData,
  HealthData,
  ReadyData,
} from "@minimi/shared";
import { isAcceptingTraffic } from "../performance/readiness.js";
import { loadPerfConfig } from "../performance/perf.config.js";
import { getMetricsRegistry } from "../performance/metrics.registry.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    const payload: HealthData = {
      status: "healthy",
      service: "minimi-api",
      timestamp: new Date().toISOString(),
    };
    return ok(payload);
  });

  app.get("/api/health/db", async () => {
    let connected = false;

    try {
      await app.db.execute(sql`SELECT 1`);
      connected = true;
    } catch {
      connected = false;
    }

    const payload: DatabaseHealthData = {
      status: connected ? "healthy" : "unhealthy",
      connected,
      databasePath:
        app.env.NODE_ENV === "production" ? "[redacted]" : app.databasePath,
      timestamp: new Date().toISOString(),
    };

    return ok(payload);
  });

  app.get("/api/health/ready", async (_request, reply) => {
    let databaseOk = false;

    try {
      await app.db.execute(sql`SELECT 1`);
      databaseOk = true;
    } catch {
      databaseOk = false;
    }

    const accepting = isAcceptingTraffic();
    const ready = databaseOk && accepting;
    const payload: ReadyData = {
      status: ready ? "healthy" : "unhealthy",
      checks: {
        api: accepting,
        database: databaseOk,
      },
      timestamp: new Date().toISOString(),
    };

    if (!ready) {
      return reply.status(503).send(ok(payload));
    }

    return ok(payload);
  });

  /** Development metrics — never includes secrets. */
  app.get("/api/health/metrics", async (_request, reply) => {
    if (app.env.NODE_ENV === "production") {
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "Not found" },
      });
    }
    const perf = loadPerfConfig(app.env);
    const metrics = getMetricsRegistry(perf);
    return ok(metrics.snapshot());
  });
}
