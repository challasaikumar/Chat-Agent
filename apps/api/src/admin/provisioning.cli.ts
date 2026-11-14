#!/usr/bin/env node
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/index.js";
import { ensureFullTextSearch } from "../db/fts.js";
import { migrationsFolder } from "../db/migrate.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { AuthService } from "../auth/auth.service.js";
import { AuditService } from "../security/audit.service.js";
import { normalizeEmail } from "../auth/auth.schemas.js";

async function main() {
  const env = loadEnvironment();
  const email = (env.AUTH_BOOTSTRAP_ADMIN_EMAIL || "").trim();
  const password = env.AUTH_BOOTSTRAP_ADMIN_PASSWORD || "";

  if (!email || !password) {
    process.stderr.write(
      "Set AUTH_BOOTSTRAP_ADMIN_EMAIL and AUTH_BOOTSTRAP_ADMIN_PASSWORD in the environment (never commit these).\n",
    );
    process.exit(1);
  }

  let handle: ReturnType<typeof createDatabase>;
  try {
    handle = createDatabase();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
  const { db } = handle;
  try {
    await migrate(db, { migrationsFolder });
    await ensureFullTextSearch(db);

    const auth = new AuthService(
      env,
      new AuthRepository(db),
      new AuditService(db),
    );
    const user = await auth.bootstrapAdmin({
      email: normalizeEmail(email),
      password,
      displayName: "Administrator",
    });
    process.stdout.write(
      `Bootstrap admin created id=${user.id} email=${user.emailNormalized}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await handle.close();
  }
}

void main();
