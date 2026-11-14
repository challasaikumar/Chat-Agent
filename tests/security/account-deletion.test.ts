import { describe, expect, it, afterEach } from "vitest";
import { buildApp } from "../../apps/api/src/app.ts";
import { createTestDatabase } from "../../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../../apps/api/src/config/env.ts";
import { AuthRepository } from "../../apps/api/src/auth/auth.repository.ts";
import { AuthService } from "../../apps/api/src/auth/auth.service.ts";
import { AuditService } from "../../apps/api/src/security/audit.service.ts";
import { ConversationService } from "../../apps/api/src/services/conversation.service.ts";
import { describeDb } from "../helpers/db.ts";

describeDb("Phase 11 account deletion", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  it("deletes user data and rejects old session", async () => {
    const testDb = await createTestDatabase();
    cleanups.push(testDb.cleanup);
    const env = loadEnvironment({
      NODE_ENV: "test",
      AUTH_MODE: "session",
      AUTH_COOKIE_NAME: "minimi_session",
      APP_ALLOWED_ORIGINS: "http://localhost:5173",
      LOCAL_USER_ID: testDb.localUserId,
      AUTH_PASSWORD_MIN_LENGTH: "12",
    });
    const auth = new AuthService(
      env,
      new AuthRepository(testDb.db),
      new AuditService(testDb.db),
    );
    const user = await auth.bootstrapAdmin({
      email: "delete-me@example.com",
      password: "CorrectHorseBattery!",
    });
    const conversations = new ConversationService(testDb.db);
    const conversation = await conversations.create(user.id, "To delete");

    const app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });
    cleanups.push(() => void app.close());

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "delete-me@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    const csrf = login.json().data.csrfToken as string;

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/account/data",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": csrf,
      },
      payload: { confirm: "DELETE", password: "CorrectHorseBattery!" },
    });
    expect(deleted.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);

    await expect(conversations.get(user.id, conversation.id)).rejects.toThrow();
  });
});
