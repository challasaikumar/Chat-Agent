import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import { isFullTextSearchReady } from "../db/fts.js";

/**
 * Logical backup via `pg_dump` (custom format, restorable with `pg_restore`).
 *
 * Supabase also provides managed daily backups / PITR (Dashboard → Database → Backups);
 * this helper is for ad-hoc exports. Use a direct or Session-pooler URL (port 5432) — the
 * Transaction pooler (6543) is not suitable for pg_dump.
 * The connection string is passed as the pg_dump URI argument and is never logged.
 */
export async function backupPostgresDatabase(
  databaseUrl: string,
  destinationPath: string,
): Promise<{ destinationPath: string }> {
  const absoluteDest = resolve(destinationPath);
  const destDir = dirname(absoluteDest);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--file=${absoluteDest}`,
        databaseUrl,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) =>
      reject(new Error(`pg_dump could not start (is postgresql-client installed?): ${error.message}`)),
    );
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`pg_dump exited with code ${code}: ${stderr.trim().slice(0, 500)}`));
      }
    });
  });

  return { destinationPath: absoluteDest };
}

/**
 * Lightweight Postgres health/integrity probe: connectivity, core tables present, and the
 * full-text-search bootstrap applied. (Postgres has no `PRAGMA integrity_check` equivalent.)
 */
export async function integrityCheckPostgres(
  db: AppDatabase,
): Promise<{ ok: boolean; result: string }> {
  try {
    const rows = (await db.execute(sql`
      SELECT count(*)::int AS tables
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('users', 'conversations', 'messages', 'memory_facts')
    `)) as unknown as Array<{ tables: number }>;
    const tables = Number(rows[0]?.tables ?? 0);
    if (tables < 4) {
      return { ok: false, result: `missing core tables (found ${tables}/4)` };
    }
    const fts = await isFullTextSearchReady(db);
    return fts
      ? { ok: true, result: "ok" }
      : { ok: false, result: "full-text search bootstrap missing" };
  } catch (error) {
    return {
      ok: false,
      result: error instanceof Error ? error.message : "unknown error",
    };
  }
}
