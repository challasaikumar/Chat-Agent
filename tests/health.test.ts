import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("health routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await testDb.cleanup();
  });

  it("returns api health", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.service).toBe("minimi-api");
    expect(body.data.status).toBe("healthy");
  });

  it("returns database health", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health/db" });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
  });

  it("returns ready when database is up", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.checks.api).toBe(true);
    expect(body.data.checks.database).toBe(true);
  });
});
