import { describe, expect, it, afterEach } from "vitest";
import { buildApp } from "../../apps/api/src/app.ts";
import { createTestDatabase } from "../../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../../apps/api/src/config/env.ts";
import { AuthRepository } from "../../apps/api/src/auth/auth.repository.ts";
import { AuthService } from "../../apps/api/src/auth/auth.service.ts";
import { AuditService } from "../../apps/api/src/security/audit.service.ts";
import { describeDb } from "../helpers/db.ts";

describeDb("Phase 11 authentication and sessions", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  async function sessionApp() {
    const testDb = await createTestDatabase("auth-user-a");
    cleanups.push(testDb.cleanup);
    const env = loadEnvironment({
      NODE_ENV: "test",
      AUTH_MODE: "session",
      AUTH_COOKIE_NAME: "minimi_session",
      APP_ALLOWED_ORIGINS: "http://localhost:5173",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "sk-test",
      TAVILY_API_KEY: "tvly-test",
    });
    const auth = new AuthService(
      env,
      new AuthRepository(testDb.db),
      new AuditService(testDb.db),
    );
    await auth.bootstrapAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery!",
      displayName: "Admin",
    });
    const userB = await auth.provisionUser({
      email: "userb@example.com",
      password: "CorrectHorseBattery!",
      displayName: "User B",
      role: "user",
      actorUserId: (await auth.repo.findUserByEmail("admin@example.com"))!.id,
    });
    const app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
    });
    cleanups.push(() => void app.close());
    return { app, auth, userB, env };
  }

  function cookieFrom(response: { headers: Record<string, unknown> }): string {
    const raw = response.headers["set-cookie"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    expect(value).toBeTruthy();
    return String(value).split(";")[0]!;
  }

  it("logs in, restores session, and rejects bad password", async () => {
    const { app } = await sessionApp();
    const bad = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@example.com", password: "wrong-password!!" },
    });
    expect(bad.statusCode).toBe(401);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login);
    expect(cookie.startsWith("minimi_session=")).toBe(true);
    expect(String(login.headers["set-cookie"])).toMatch(/HttpOnly/i);
    const csrf = login.json().data.csrfToken as string;
    expect(csrf).toBeTruthy();

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    expect(session.json().data.authenticated).toBe(true);
  });

  it("rejects CSRF-less mutations and wrong origin", async () => {
    const { app } = await sessionApp();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    const cookie = cookieFrom(login);

    const noCsrf = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: { cookie, origin: "http://localhost:5173" },
      payload: { title: "Nope" },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error.code).toBe("CSRF_REJECTED");

    const badOrigin = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: {
        cookie,
        origin: "https://evil.example",
        "x-csrf-token": login.json().data.csrfToken,
      },
      payload: { title: "Nope" },
    });
    expect(badOrigin.statusCode).toBe(403);
  });

  it("isolates conversations across users", async () => {
    const { app } = await sessionApp();

    const loginA = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    const cookieA = cookieFrom(loginA);
    const csrfA = loginA.json().data.csrfToken as string;

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: {
        cookie: cookieA,
        origin: "http://localhost:5173",
        "x-csrf-token": csrfA,
      },
      payload: { title: "Private A" },
    });
    expect(created.statusCode).toBe(201);
    const conversationId = created.json().data.id as string;

    const loginB = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "userb@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    const cookieB = cookieFrom(loginB);

    const stolen = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}`,
      headers: { cookie: cookieB },
    });
    expect(stolen.statusCode).toBe(404);
  });

  it("rejects revoked sessions after logout", async () => {
    const { app } = await sessionApp();
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery!",
      },
    });
    const cookie = cookieFrom(login);
    const csrf = login.json().data.csrfToken as string;

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": csrf,
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });
});
