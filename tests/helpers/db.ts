import { describe, it } from "vitest";
import { hasTestDatabase } from "../../apps/api/src/db/test-utils.ts";

/**
 * Database-backed suites need a disposable Postgres via DATABASE_URL_TEST
 * (each test database gets its own schema). Without it they are skipped.
 */
export const describeDb = hasTestDatabase() ? describe : describe.skip;
export const itDb = hasTestDatabase() ? it : it.skip;
