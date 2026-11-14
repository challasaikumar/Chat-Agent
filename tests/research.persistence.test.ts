import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { ConversationRepository } from "../apps/api/src/repositories/conversation.repository.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { researchSnapshots, researchSources } from "../apps/api/src/db/schema.ts";
import { eq } from "drizzle-orm";
import { describeDb } from "./helpers/db.ts";

describeDb("research persistence", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("creates snapshot + sources atomically and isolates ownership", async () => {
    testDb = await createTestDatabase("owner-user");
    const conversations = new ConversationRepository(testDb.db);
    const research = new ResearchRepository(testDb.db);

    const conversation = await conversations.create({
      userId: testDb.localUserId,
      title: "Research",
    });

    const retrievedAt = new Date().toISOString();
    const created = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "PostgreSQL hosting pricing",
      title: "PostgreSQL hosting pricing",
      provider: "tavily",
      providerRequestId: "req-abc",
      searchParameters: { query: "PostgreSQL hosting pricing", maxResults: 2 },
      responseTimeMs: 180,
      resultCount: 2,
      sources: [
        {
          title: "Neon Pricing",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Serverless Postgres",
          score: 0.9,
          publishedAt: "2025-10-01T00:00:00.000Z",
          retrievedAt,
          faviconUrl: "https://neon.tech/favicon.ico",
          contentHash: "hash-1",
        },
        {
          title: "Supabase Pricing",
          url: "https://supabase.com/pricing",
          domain: "supabase.com",
          content: "Postgres platform",
          score: 0.8,
          publishedAt: null,
          retrievedAt,
          faviconUrl: null,
          contentHash: "hash-2",
        },
      ],
    });

    expect(created.snapshot.resultCount).toBe(2);
    expect(created.snapshot.provider).toBe("tavily");
    expect(created.sources).toHaveLength(2);
    expect(created.sources[0]?.relevanceScore).toBe(0.9);

    const fetched = await research.findSnapshotForUser(
      created.snapshot.id,
      testDb.localUserId,
    );
    expect(fetched?.id).toBe(created.snapshot.id);

    expect(
      await research.findSnapshotForUser(created.snapshot.id, "other-user"),
    ).toBeUndefined();

    const sources = await research.listSourcesForSnapshot(created.snapshot.id);
    expect(sources).toHaveLength(2);
    expect(sources.every((source) => source.snapshotId === created.snapshot.id)).toBe(
      true,
    );
  });

  it("rolls back snapshot writes when the transaction fails", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationRepository(testDb.db);
    const conversation = await conversations.create({ userId: testDb.localUserId });

    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(researchSnapshots)
          .values({
            id: "00000000-0000-4000-8000-000000000010",
            userId: testDb.localUserId,
            conversationId: conversation.id,
            query: "rollback",
            title: "rollback",
            provider: "tavily",
            providerRequestId: null,
            searchParameters: { query: "rollback" },
            capturedAt: new Date(),
            responseTimeMs: 1,
            resultCount: 1,
            createdAt: new Date(),
          });

        throw new Error("forced persistence failure");
      }),
    ).rejects.toThrow(/forced persistence failure/);

    const snapshots = await testDb.db.select().from(researchSnapshots);
    const sources = await testDb.db.select().from(researchSources);
    expect(snapshots).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it("supports historical snapshot listing", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationRepository(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create({ userId: testDb.localUserId });

    for (let i = 0; i < 3; i += 1) {
      await research.createSnapshotWithSources({
        userId: testDb.localUserId,
        conversationId: conversation.id,
        query: `query ${i}`,
        title: `query ${i}`,
        provider: "tavily",
        providerRequestId: null,
        searchParameters: { query: `query ${i}` },
        responseTimeMs: i,
        resultCount: 0,
        sources: [],
      });
    }

    const page = await research.listSnapshotsForUser(testDb.localUserId, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();

    const page2 = await research.listSnapshotsForUser(testDb.localUserId, {
      limit: 2,
      cursor: page.nextCursor ?? undefined,
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const only = await research.findSnapshotForUser(page.items[0]!.id, testDb.localUserId);
    expect(only?.query).toContain("query");
    expect(
      (await testDb.db
        .select()
        .from(researchSnapshots)
        .where(eq(researchSnapshots.conversationId, conversation.id))),
    ).toHaveLength(3);
  });
});
