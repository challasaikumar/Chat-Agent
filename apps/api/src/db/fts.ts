import { sql } from "drizzle-orm";
import type { AppDatabase } from "./index.js";

/**
 * Postgres full-text search setup (replaces SQLite FTS5).
 *
 * Kept outside the Drizzle schema because drizzle-kit does not model tsvector
 * generated columns / trigger functions. Every statement is idempotent so it
 * can run on each boot (see `applyMigrations`) and in test bootstraps.
 *
 * - `messages.search_vector`: GENERATED ALWAYS … STORED tsvector over `content` (+ GIN index).
 * - `memory_facts.search_vector`: trigger-maintained tsvector over fact, memory_key and the
 *   linked entity display name (+ GIN index). No application-level upsert/delete sync is needed;
 *   rows leave the index automatically when facts are deleted or cascaded.
 */
export const FTS_CONFIG = "english";

const FTS_ADVISORY_LOCK_KEY = 727_274_001;

const statements = [
  sql`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
  `,
  sql`
    CREATE INDEX IF NOT EXISTS messages_search_vector_idx
      ON messages USING GIN (search_vector)
  `,
  sql`
    ALTER TABLE memory_facts
      ADD COLUMN IF NOT EXISTS search_vector tsvector
  `,
  sql`
    CREATE OR REPLACE FUNCTION memory_facts_search_vector_update() RETURNS trigger AS $fn$
    DECLARE
      linked_entity_name text;
    BEGIN
      IF NEW.entity_id IS NOT NULL THEN
        SELECT display_name INTO linked_entity_name FROM entities WHERE id = NEW.entity_id;
      END IF;
      NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.fact, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.memory_key, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(linked_entity_name, '')), 'B');
      RETURN NEW;
    END
    $fn$ LANGUAGE plpgsql
  `,
  sql`DROP TRIGGER IF EXISTS memory_facts_search_vector_trg ON memory_facts`,
  sql`
    CREATE TRIGGER memory_facts_search_vector_trg
      BEFORE INSERT OR UPDATE OF fact, memory_key, entity_id ON memory_facts
      FOR EACH ROW EXECUTE FUNCTION memory_facts_search_vector_update()
  `,
  sql`
    CREATE INDEX IF NOT EXISTS memory_facts_search_vector_idx
      ON memory_facts USING GIN (search_vector)
  `,
  // Backfill rows created before the trigger existed (fires the trigger via UPDATE OF fact).
  sql`UPDATE memory_facts SET fact = fact WHERE search_vector IS NULL`,
];

/** Cheap catalog probe so request-path callers can skip DDL when already provisioned. */
export async function isFullTextSearchReady(db: AppDatabase): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name IN ('messages', 'memory_facts')
          AND column_name = 'search_vector') AS columns_present,
      (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND t.tgname = 'memory_facts_search_vector_trg'
          AND NOT t.tgisinternal) AS trigger_present
  `)) as unknown as Array<{ columns_present: string | number; trigger_present: string | number }>;
  const row = rows[0];
  return Number(row?.columns_present ?? 0) === 2 && Number(row?.trigger_present ?? 0) === 1;
}

/**
 * Create tsvector columns, trigger and GIN indexes. Requires the Drizzle migrations
 * (messages / memory_facts / entities tables) to have been applied first.
 */
export async function ensureFullTextSearch(db: AppDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialise concurrent boots (multiple instances / parallel tests on one database).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${FTS_ADVISORY_LOCK_KEY})`);
    for (const statement of statements) {
      await tx.execute(statement);
    }
  });
}

/** Provision FTS only when missing (cheap no-op on a prepared database). */
export async function ensureFullTextSearchIfMissing(db: AppDatabase): Promise<void> {
  if (await isFullTextSearchReady(db)) {
    return;
  }
  await ensureFullTextSearch(db);
}

/** Recompute every memory fact vector (e.g. after bulk-renaming entities). */
export async function rebuildMemoryFactSearchVectors(db: AppDatabase): Promise<void> {
  await db.execute(sql`UPDATE memory_facts SET fact = fact`);
}
