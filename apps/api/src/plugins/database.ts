import type { FastifyInstance } from "fastify";
import type { AppDatabase, SqlClient } from "../db/index.js";
import {
  closeDefaultDatabase,
  db as defaultDb,
  getDatabasePath,
  sqlClient as defaultSqlClient,
} from "../db/index.js";
import { env } from "../config/env.js";
import { ensureLocalUser } from "../db/seed.js";
import { ensureFullTextSearchIfMissing } from "../db/fts.js";

export type DatabasePluginOptions = {
  db?: AppDatabase;
  sqlClient?: SqlClient;
  /** Credential-free connection label for dev health output. */
  databasePath?: string;
  localUserId?: string;
  ensureFts?: boolean;
  ensureUser?: boolean;
  /** Called on app close for injected (test) databases that the caller owns. */
  onClose?: () => Promise<void>;
};

declare module "fastify" {
  interface FastifyInstance {
    db: AppDatabase;
    sqlClient: SqlClient;
    /** Credential-free `host:port/database` label (kept under the legacy name for the health API). */
    databasePath: string;
    localUserId: string;
  }
}

export async function registerDatabase(
  app: FastifyInstance,
  options: DatabasePluginOptions = {},
): Promise<void> {
  const database = options.db ?? defaultDb;
  const client = options.sqlClient ?? defaultSqlClient;
  const injected = Boolean(options.db);
  const databasePath =
    options.databasePath ?? (injected ? "injected" : getDatabasePath());
  const localUserId = options.localUserId ?? env.LOCAL_USER_ID;

  if (options.ensureFts !== false) {
    await ensureFullTextSearchIfMissing(database);
  }
  if (options.ensureUser !== false) {
    await ensureLocalUser(database, localUserId);
  }

  app.decorate("db", database);
  app.decorate("sqlClient", client);
  app.decorate("databasePath", databasePath);
  app.decorate("localUserId", localUserId);

  app.addHook("onClose", async () => {
    if (options.onClose) {
      await options.onClose();
    } else if (!injected) {
      // Process singleton: release pool connections on shutdown.
      await closeDefaultDatabase();
    }
  });
}
