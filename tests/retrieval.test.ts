import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { RetrievalService } from "../apps/api/src/memory/retrieval.service.ts";
import { calendarDayBoundsUtc } from "../apps/api/src/utils/timezone.ts";
import { EntityService } from "../apps/api/src/memory/entity.service.ts";
import { FactService } from "../apps/api/src/memory/fact.service.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("historical retrieval", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("supports exact date, timezone boundaries, ranges, and keyword+date", async () => {
    testDb = await createTestDatabase("local-dev-user");
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
      APP_TIME_ZONE: "Asia/Kolkata",
    });

    const conversations = new ConversationService(testDb.db);
    const retrieval = new RetrievalService(testDb.db, env);
    const entities = new EntityService(testDb.db);
    const facts = new FactService(testDb.db);

    const conversation = await conversations.create(testDb.localUserId, "Nov research");

    // 2025-11-03 10:30 IST = 2025-11-03 05:00 UTC
    const istMorning = calendarDayBoundsUtc("2025-11-03", "Asia/Kolkata").start;
    const at1030 = new Date(istMorning.getTime() + 10.5 * 60 * 60 * 1000);

    const message = await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "Asked about Neon database pricing on that day",
    });

    // Override created_at to the historical instant.
    await testDb.sqlClient.unsafe(
      "UPDATE messages SET created_at = $1 WHERE id = $2",
      [at1030.toISOString(), message.id],
    );
    await testDb.sqlClient.unsafe(
      "UPDATE conversations SET last_message_at = $1, updated_at = $2 WHERE id = $3",
      [at1030.toISOString(), at1030.toISOString(), conversation.id],
    );

    // Re-sync FTS after manual timestamp update (content unchanged; index already has row).
    const entity = (await entities.upsertExtracted(conversation.id, [
      {
        entityType: "service",
        displayName: "Neon",
        aliases: [],
        supportingMessageIds: [message.id],
      },
    ]))[0]!;

    await facts.upsertExtracted(
      testDb.localUserId,
      conversation.id,
      [
        {
          category: "research_reference",
          fact: "User researched Neon pricing",
          confidence: 0.85,
          sourceMessageId: message.id,
          evidenceExcerpt: "Neon database pricing",
          entityDisplayName: "Neon",
          entityType: "service",
        },
      ],
      new Set([message.id]),
    );

    const byDate = await retrieval.search(testDb.localUserId, {
      date: "2025-11-03",
      timeZone: "Asia/Kolkata",
      limit: 20,
    });
    expect(byDate.messages.some((m) => m.id === message.id)).toBe(true);

    const outside = await retrieval.search(testDb.localUserId, {
      date: "2025-11-04",
      timeZone: "Asia/Kolkata",
      limit: 20,
    });
    expect(outside.messages.some((m) => m.id === message.id)).toBe(false);

    const range = await retrieval.search(testDb.localUserId, {
      from: "2025-11-01",
      to: "2025-11-05",
      timeZone: "Asia/Kolkata",
      limit: 20,
    });
    expect(range.messages.some((m) => m.id === message.id)).toBe(true);

    const combined = await retrieval.search(testDb.localUserId, {
      q: "Neon",
      date: "2025-11-03",
      timeZone: "Asia/Kolkata",
      limit: 20,
    });
    expect(combined.messages.some((m) => m.id === message.id)).toBe(true);
    expect(combined.entities.some((e) => e.id === entity.id)).toBe(true);
    expect(combined.facts.length).toBeGreaterThan(0);

    // DST-safe check for America/New_York spring forward day.
    const nyc = calendarDayBoundsUtc("2025-03-09", "America/New_York");
    expect(nyc.end.getTime()).toBeGreaterThan(nyc.start.getTime());
    expect(nyc.end.getTime() - nyc.start.getTime()).toBeLessThan(25 * 60 * 60 * 1000);
  });
});
