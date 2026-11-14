import { readMigrationFiles } from "drizzle-orm/migrator";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import {
  createDatabase,
  createSqlClient,
  DatabaseConfigError,
  type DatabaseHandle,
} from "./index.js";
import { ensureFullTextSearch } from "./fts.js";
import { migrationsFolder } from "./migrate.js";
import { ensureLocalUser } from "./seed.js";

export type TestDatabase = DatabaseHandle & {
  localUserId: string;
  schemaName: string;
  cleanup: () => Promise<void>;
};

/** True when a disposable Postgres is configured for tests (DATABASE_URL_TEST). */
export function hasTestDatabase(): boolean {
  return env.DATABASE_URL_TEST.trim().length > 0;
}

function requireTestUrl(): string {
  const url = env.DATABASE_URL_TEST.trim();
  if (!url) {
    throw new DatabaseConfigError(
      "DATABASE_URL_TEST is not set — database-backed tests are skipped. " +
        "Set it to a disposable Postgres (e.g. postgresql://postgres:postgres@127.0.0.1:5432/minimi_test).",
    );
  }
  if (env.DATABASE_URL.trim() && env.DATABASE_URL.trim() === url) {
    throw new DatabaseConfigError(
      "DATABASE_URL_TEST must differ from DATABASE_URL — tests create and drop schemas.",
    );
  }
  return url;
}

/**
 * Isolated Postgres schema per test database (parallel-safe). Uses the generated Drizzle
 * migration SQL with `"public".` rewritten to the test schema, then the FTS bootstrap.
 */
export async function createTestDatabase(
  localUserId = `test-user-${randomUUID()}`,
): Promise<TestDatabase> {
  const url = requireTestUrl();
  const schemaName = `t_${randomUUID().replace(/-/g, "")}`;

  const admin = createSqlClient({ url, max: 1 });
  await admin.sqlClient.unsafe(`CREATE SCHEMA "${schemaName}"`);

  const handle = createDatabase({ url, searchPath: schemaName, max: 4 });

  try {
    for (const migration of readMigrationFiles({ migrationsFolder })) {
      for (const statement of migration.sql) {
        await handle.sqlClient.unsafe(
          statement.replaceAll('"public".', `"${schemaName}".`),
        );
      }
    }
    await ensureFullTextSearch(handle.db);
    await ensureLocalUser(handle.db, localUserId);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await admin.sqlClient
      .unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      .catch(() => undefined);
    await admin.sqlClient.end({ timeout: 2 }).catch(() => undefined);
    throw error;
  }

  let cleanedUp = false;
  return {
    ...handle,
    localUserId,
    schemaName,
    cleanup: async () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        await handle.close();
      } catch {
        // already closed
      }
      try {
        await admin.sqlClient.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await admin.sqlClient.end({ timeout: 2 });
      }
    },
  };
}
