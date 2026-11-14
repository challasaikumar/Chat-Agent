import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase, PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

/**
 * Query executor used by repositories/services.
 * Accepts both the root drizzle database and a transaction handle (`db.transaction(async (tx) => …)`).
 */
export type AppDatabase = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;
export type RootDatabase = PostgresJsDatabase<typeof schema>;
/** Raw postgres.js client (tagged-template SQL). */
export type SqlClient = postgres.Sql;

export type DatabaseHandle = {
  db: RootDatabase;
  sqlClient: SqlClient;
  /** Credential-free label (host:port/db) safe to log / expose in dev health. */
  path: string;
  close: () => Promise<void>;
};

export type CreateDatabaseOptions = {
  url?: string;
  max?: number;
  /** Postgres schema to put first on search_path (test isolation). */
  searchPath?: string;
  idleTimeoutSeconds?: number;
};

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

function isTestRuntime(): boolean {
  return process.env.VITEST === "true" || env.NODE_ENV === "test";
}

/** Resolve the connection URL for the current runtime (tests use DATABASE_URL_TEST only). */
export function resolveDatabaseUrl(): string {
  if (isTestRuntime()) {
    const testUrl = env.DATABASE_URL_TEST.trim();
    if (!testUrl) {
      throw new DatabaseConfigError(
        "DATABASE_URL_TEST is not set. Point it at a disposable Postgres database for tests (never production).",
      );
    }
    return testUrl;
  }
  const url = env.DATABASE_URL.trim();
  if (!url) {
    throw new DatabaseConfigError(
      "DATABASE_URL is not set. Paste the Postgres connection string (URI) from Supabase Dashboard → " +
        "Project Settings → Database → Connection string into .env (Session mode 5432 for the long-running " +
        "Fastify API; Transaction pooler 6543 also works) or point it at a local Postgres.",
    );
  }
  return url;
}

export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const dbName = parsed.pathname.replace(/^\//, "") || "postgres";
    return `${parsed.hostname}:${parsed.port || "5432"}/${dbName}`;
  } catch {
    return "[invalid DATABASE_URL]";
  }
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

export function createSqlClient(options: CreateDatabaseOptions = {}): {
  sqlClient: SqlClient;
  label: string;
} {
  const url = options.url ?? resolveDatabaseUrl();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DatabaseConfigError(
      "DATABASE_URL is not a valid URI (expected postgresql://user:password@host:port/database).",
    );
  }

  const sslmode = parsed.searchParams.get("sslmode");
  const remote = !isLocalHost(parsed.hostname);
  // Supabase pooler (Supavisor) can break prepared statements; disable for any supabase host.
  const supabaseHost =
    parsed.hostname.includes("supabase.co") ||
    parsed.hostname.includes("pooler.supabase.com");
  const transactionPooler =
    parsed.port === "6543" ||
    parsed.searchParams.get("pgbouncer") === "true" ||
    supabaseHost;

  const sqlClient = postgres(url, {
    max: options.max ?? env.DATABASE_POOL_MAX,
    idle_timeout: options.idleTimeoutSeconds ?? 20,
    connect_timeout: 15,
    prepare: !transactionPooler,
    ssl: sslmode ? undefined : remote ? "require" : false,
    // Keep timestamptz round-tripping as Date objects (default) and silence NOTICEs.
    onnotice: () => undefined,
    ...(options.searchPath
      ? { connection: { search_path: options.searchPath } }
      : {}),
  });

  return { sqlClient, label: describeDatabaseUrl(url) };
}

export function createDatabase(
  options: CreateDatabaseOptions | string = {},
): DatabaseHandle {
  const resolved: CreateDatabaseOptions =
    typeof options === "string" ? { url: options } : options;
  const { sqlClient, label } = createSqlClient(resolved);
  const db = drizzle(sqlClient, { schema });

  return {
    db,
    sqlClient,
    path: label,
    close: async () => {
      await sqlClient.end({ timeout: 5 });
    },
  };
}

let defaultHandle: DatabaseHandle | null = null;

export function getDefaultDatabase(): DatabaseHandle {
  if (!defaultHandle) {
    defaultHandle = createDatabase();
  }
  return defaultHandle;
}

export async function closeDefaultDatabase(): Promise<void> {
  if (!defaultHandle) {
    return;
  }
  const handle = defaultHandle;
  defaultHandle = null;
  await handle.close();
}

/** Lazy process singleton — prefer injecting a handle in tests. */
export const db: AppDatabase = new Proxy({} as AppDatabase, {
  get(_target, property, receiver) {
    const active = getDefaultDatabase().db;
    const value = Reflect.get(active, property, receiver);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(active)
      : value;
  },
});

/** Lazy raw postgres.js client singleton (callable tagged template + helpers). */
export const sqlClient: SqlClient = new Proxy(
  function sqlClientProxy() {} as unknown as SqlClient,
  {
    get(_target, property) {
      const active = getDefaultDatabase().sqlClient;
      const value = Reflect.get(active, property);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(active)
        : value;
    },
    apply(_target, _thisArg, args) {
      const active = getDefaultDatabase().sqlClient as unknown as (
        ...a: unknown[]
      ) => unknown;
      return active(...args);
    },
  },
);

export function getDatabasePath(): string {
  return getDefaultDatabase().path;
}
