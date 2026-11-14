import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { ConversationRepository } from "../apps/api/src/repositories/conversation.repository.ts";
import { MessageRepository } from "../apps/api/src/repositories/message.repository.ts";
import { EntityRepository } from "../apps/api/src/repositories/entity.repository.ts";
import { users, conversations, messages } from "../apps/api/src/db/schema.ts";
import { eq } from "drizzle-orm";
import { describeDb } from "./helpers/db.ts";

describeDb("database schema and constraints", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("applies migrations and preserves foreign keys", async () => {
    testDb = await createTestDatabase();

    const tables = await testDb.sqlClient<Array<{ name: string }>>`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const names = tables.map((t) => t.name);
    expect(names).toContain("app_metadata");
    expect(names).toContain("users");
    expect(names).toContain("conversations");
    expect(names).toContain("messages");
    expect(names).toContain("memory_facts");
    expect(names).toContain("research_sources");

    const ftsColumns = await testDb.sqlClient<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND column_name = 'search_vector'
        AND table_name IN ('messages', 'memory_facts')
    `;
    expect(ftsColumns).toHaveLength(2);
  });

  it("rejects conversation without valid user (FK)", async () => {
    testDb = await createTestDatabase();

    await expect(
      testDb.db.insert(conversations).values({
        id: "00000000-0000-4000-8000-000000000099",
        userId: "missing-user",
        title: "orphan",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("rolls back a failed transaction", async () => {
    testDb = await createTestDatabase();
    const conversationRepo = new ConversationRepository(testDb.db);
    const conversation = await conversationRepo.create({
      userId: testDb.localUserId,
      title: "tx test",
    });

    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(messages)
          .values({
            conversationId: conversation.id,
            role: "user",
            content: "should roll back",
            createdAt: new Date(),
          });

        await tx.insert(users)
          .values({
            id: testDb.localUserId,
            displayName: "duplicate",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
      }),
    ).rejects.toThrow();

    const remaining = await testDb.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    expect(remaining).toHaveLength(0);
  });

  it("enforces unique entity type + canonical name", async () => {
    testDb = await createTestDatabase();
    const entities = new EntityRepository(testDb.db);

    const first = await entities.upsert({
      entityType: "company",
      displayName: "Acme Corp",
    });
    const second = await entities.upsert({
      entityType: "company",
      displayName: "acme corp",
      aliases: ["ACME"],
    });

    expect(second.id).toBe(first.id);
    expect(second.aliases).toContain("ACME");
  });

  it("updates last_message_at when inserting messages", async () => {
    testDb = await createTestDatabase();
    const conversationRepo = new ConversationRepository(testDb.db);
    const messageRepo = new MessageRepository(testDb.db);

    const conversation = await conversationRepo.create({
      userId: testDb.localUserId,
    });
    expect(conversation.lastMessageAt).toBeNull();

    const message = await messageRepo.insert({
      conversationId: conversation.id,
      role: "user",
      content: "hello",
    });

    const updated = await conversationRepo.findByIdForUser(
      conversation.id,
      testDb.localUserId,
    );
    expect(updated?.lastMessageAt?.getTime()).toBe(message.createdAt.getTime());
  });
});
