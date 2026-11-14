import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../apps/api/src/app.ts";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("conversation API", () => {
  let testDb: TestDatabase;
  let app: Awaited<ReturnType<typeof buildApp>>;

  afterEach(async () => {
    await app?.close();
    await testDb?.cleanup();
  });

  async function setup() {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      OPENAI_API_KEY: "",
    });

    app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
        ensureFts: true,
        ensureUser: true,
      },
    });
  }

  it("creates, lists, updates, and retrieves messages in order", async () => {
    await setup();

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: { title: "Research CRM" },
    });
    expect(created.statusCode).toBe(201);
    const conversation = created.json().data;
    expect(conversation.title).toBe("Research CRM");
    expect(conversation.userId).toBe(testDb.localUserId);

    for (const [role, content] of [
      ["user", "first"],
      ["assistant", "second"],
      ["user", "third"],
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversation.id}/messages`,
        payload: { role, content },
      });
      expect(response.statusCode).toBe(201);
    }

    const messages = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversation.id}/messages`,
    });
    expect(messages.statusCode).toBe(200);
    const items = messages.json().data.items;
    expect(items.map((m: { content: string }) => m.content)).toEqual([
      "first",
      "second",
      "third",
    ]);

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/conversations/${conversation.id}`,
      payload: { title: "Updated title" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.title).toBe("Updated title");

    const listed = await app.inject({
      method: "GET",
      url: "/api/conversations?limit=10",
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.items.length).toBeGreaterThanOrEqual(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/conversations/${conversation.id}`,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data.deleted).toBe(true);

    const missing = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversation.id}`,
    });
    expect(missing.statusCode).toBe(404);
  });

  it("paginates conversations and isolates ownership", async () => {
    await setup();

    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { title: `Conv ${i}` },
      });
    }

    const page1 = await app.inject({
      method: "GET",
      url: "/api/conversations?limit=2",
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().data.items).toHaveLength(2);
    expect(page1.json().data.nextCursor).toBeTruthy();

    const page2 = await app.inject({
      method: "GET",
      url: `/api/conversations?limit=2&cursor=${encodeURIComponent(page1.json().data.nextCursor)}`,
    });
    expect(page2.statusCode).toBe(200);
    expect(page2.json().data.items.length).toBeGreaterThanOrEqual(1);

    const foreign = await app.inject({
      method: "GET",
      url: "/api/conversations/00000000-0000-4000-8000-000000000001",
    });
    expect(foreign.statusCode).toBe(404);
  });
});
