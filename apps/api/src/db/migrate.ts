import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import {
  createDatabase,
  DatabaseConfigError,
  type DatabaseHandle,
} from "./index.js";
import { ensureFullTextSearch } from "./fts.js";
import { ensureLocalUser } from "./seed.js";

export const migrationsFolder = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../drizzle",
);

/**
 * Apply Drizzle (Postgres) migrations, then the idempotent full-text-search bootstrap
 * (tsvector columns, trigger, GIN indexes — see `fts.ts`).
 *
 * When `handle` is provided (server startup), the connection is left open.
 * CLI usage creates a temporary connection and closes it.
 *
 * Throws `DatabaseConfigError` with a clear message when DATABASE_URL is unset.
 */
export async function applyMigrations(handle?: DatabaseHandle): Promise<void> {
  const ownsConnection = !handle;
  const active = handle ?? createDatabase();

  try {
    await migrate(active.db, { migrationsFolder });
    await ensureFullTextSearch(active.db);
    if (env.AUTH_MODE === "local_dev") {
      await ensureLocalUser(active.db, env.LOCAL_USER_ID);
    }
    console.log(`Migrations applied → ${active.path}`);
  } finally {
    if (ownsConnection) {
      await active.close();
    }
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  applyMigrations().catch((error: unknown) => {
    if (error instanceof DatabaseConfigError) {
      console.error(`\nMigration aborted: ${error.message}\n`);
    } else {
      console.error("Migration failed:", error);
    }
    process.exit(1);
  });
}
