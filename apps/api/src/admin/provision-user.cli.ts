#!/usr/bin/env node
/**
 * Provision a member/user (or admin) account.
 *
 * Usage:
 *   AUTH_PROVISION_EMAIL=... AUTH_PROVISION_PASSWORD=... \
 *   AUTH_PROVISION_DISPLAY_NAME="Sathya" AUTH_PROVISION_ROLE=user \
 *   npm run auth:provision-user
 *
 * Never commit provision passwords.
 */
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { loadEnvironment } from "../config/env.js";
import { createDatabase } from "../db/index.js";
import { ensureFullTextSearch } from "../db/fts.js";
import { migrationsFolder } from "../db/migrate.js";
import { users } from "../db/schema.js";
import { AuthRepository } from "../auth/auth.repository.js";
import { AuthService } from "../auth/auth.service.js";
import { AuditService } from "../security/audit.service.js";
import { normalizeEmail } from "../auth/auth.schemas.js";

async function main() {
  const env = loadEnvironment();
  const email = (process.env.AUTH_PROVISION_EMAIL || "").trim();
  const password = process.env.AUTH_PROVISION_PASSWORD || "";
  const displayName =
    (process.env.AUTH_PROVISION_DISPLAY_NAME || "").trim() || "Member";
  const roleRaw = (process.env.AUTH_PROVISION_ROLE || "user").trim().toLowerCase();
  const role = roleRaw === "admin" ? "admin" : "user";

  if (!email || !password) {
    process.stderr.write(
      "Set AUTH_PROVISION_EMAIL and AUTH_PROVISION_PASSWORD (never commit these).\n",
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

    const repo = new AuthRepository(db);
    const auth = new AuthService(env, repo, new AuditService(db));

    const existing = await repo.findUserByEmail(email);
    if (existing) {
      process.stdout.write(
        `User already exists id=${existing.id} email=${existing.emailNormalized} role=${existing.role}\n`,
      );
      return;
    }

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    const actorUserId = admins[0]?.id;
    if (!actorUserId) {
      process.stderr.write(
        "No admin user found. Run npm run auth:bootstrap first.\n",
      );
      process.exitCode = 1;
      return;
    }

    const user = await auth.provisionUser({
      email: normalizeEmail(email),
      password,
      displayName,
      role,
      actorUserId,
    });

    process.stdout.write(
      `Provisioned ${role} id=${user.id} email=${user.emailNormalized}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Provision failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await handle.close();
  }
}

void main();
