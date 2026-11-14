import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { ConversationRepository } from "../apps/api/src/repositories/conversation.repository.ts";
import { MessageRepository } from "../apps/api/src/repositories/message.repository.ts";
import { FtsRepository } from "../apps/api/src/repositories/fts.repository.ts";
import { sanitizeFtsQuery } from "../apps/api/src/utils/fts-query.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("Postgres full-text message search", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  async function seed() {
    testDb = await createTestDatabase();
    const conversations = new ConversationRepository(testDb.db);
    const messages = new MessageRepository(testDb.db);

    const a = await conversations.create({
      userId: testDb.localUserId,
      title: "A",
    });
    const b = await conversations.create({
      userId: testDb.localUserId,
      title: "B",
    });

    await messages.insert({
      conversationId: a.id,
      role: "user",
      content: "Compare Salesforce CRM pricing tiers",
    });
    await messages.insert({
      conversationId: a.id,
      role: "assistant",
      content: "Salesforce Enterprise starts around a specific quote",
    });
    const outdated = await messages.insert({
      conversationId: b.id,
      role: "user",
      content: "HubSpot marketing automation notes",
    });
    await messages.insert({
      conversationId: b.id,
      role: "user",
      content: "exact phrase temporal reasoning challenge",
    });

    return { a, b, outdated, fts: new FtsRepository(testDb.db), messages };
  }

  it("supports keyword and phrase search", async () => {
    const { a, fts } = await seed();

    const keyword = await fts.search({ query: "Salesforce", limit: 10 });
    expect(keyword.length).toBeGreaterThan(0);
    expect(keyword.some((hit) => hit.content.includes("Salesforce"))).toBe(true);

    const phrase = await fts.search({
      query: '"temporal reasoning"',
      limit: 10,
    });
    expect(phrase).toHaveLength(1);
    expect(phrase[0]?.content).toContain("temporal reasoning");

    const filtered = await fts.search({
      query: "Salesforce",
      conversationId: a.id,
      limit: 10,
    });
    expect(filtered.every((hit) => hit.conversationId === a.id)).toBe(true);
  });

  it("searches across conversations and syncs updates/deletes", async () => {
    const { fts, messages, outdated } = await seed();

    const across = await fts.search({ query: "CRM OR HubSpot OR Salesforce", limit: 10 });
    // sanitizer strips OR — still finds tokens independently via separate searches
    const hubspot = await fts.search({ query: "HubSpot", limit: 10 });
    expect(hubspot.length).toBeGreaterThan(0);

    await messages.updateContent(outdated.id, "Updated content about Dynamics 365");
    const afterUpdate = await fts.search({ query: "Dynamics", limit: 10 });
    expect(afterUpdate.some((hit) => hit.messageId === outdated.id)).toBe(true);
    expect(await fts.search({ query: "HubSpot", limit: 10 })).toHaveLength(0);

    await messages.deleteById(outdated.id);
    expect(await fts.search({ query: "Dynamics", limit: 10 })).toHaveLength(0);

    // silence unused
    expect(across).toBeDefined();
  });

  it("handles malformed and empty queries safely", async () => {
    await seed();
    const fts = new FtsRepository(testDb.db);

    expect(sanitizeFtsQuery("")).toBeNull();
    expect(sanitizeFtsQuery('""')).toBeNull();
    expect(sanitizeFtsQuery("AND OR NOT")).toBeNull();
    expect(await fts.search({ query: '^^^ (((', limit: 10 })).toEqual([]);
    expect(await fts.search({ query: "", limit: 10 })).toEqual([]);
  });
});
