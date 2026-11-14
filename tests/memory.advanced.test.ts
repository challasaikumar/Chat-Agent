import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { MemoryService } from "../apps/api/src/memory/memory.service.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { shouldSupersede } from "../apps/api/src/memory/consolidation/memory-versioning.ts";
import { detectConflicts } from "../apps/api/src/memory/consolidation/memory-conflict-detector.ts";
import { analyzeMemoryQuery } from "../apps/api/src/memory/retrieval/memory-query-analyzer.ts";
import type { MemoryFact } from "../apps/api/src/db/schema.ts";
import { describeDb } from "./helpers/db.ts";

function baseFact(overrides: Partial<MemoryFact> & Pick<MemoryFact, "id" | "fact">): MemoryFact {
  return {
    userId: "u",
    entityId: null,
    category: "decision",
    memoryType: "decision",
    memoryKey: "decision:database",
    normalizedValue: "mysql",
    confidence: 0.9,
    importance: 0.8,
    assertionType: "explicitly_stated",
    assertionStatus: "confirmed",
    sourceMessageId: 1,
    sourceConversationId: "c",
    evidenceExcerpt: overrides.fact,
    validFrom: new Date(),
    validTo: null,
    observedAt: new Date(),
    lastConfirmedAt: new Date(),
    lastAccessedAt: null,
    accessCount: 0,
    expiresAt: null,
    supersedesFactId: null,
    supersededByFactId: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describeDb("advanced memory core", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("versions decisions without overwriting history", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const conversations = new ConversationService(testDb.db);
    const memory = new MemoryService(testDb.db, env, {
      async extract(request) {
        const id = request.messages[request.messages.length - 1]!.id;
        const content = request.messages[request.messages.length - 1]!.content;
        if (/considering PostgreSQL/i.test(content)) {
          return {
            summary: "Considering Postgres",
            entities: [
              {
                entityType: "project",
                displayName: "LMS",
                aliases: [],
                supportingMessageIds: [id],
              },
            ],
            facts: [
              {
                category: "decision",
                fact: "Considering PostgreSQL for LMS database",
                confidence: 0.8,
                importance: 0.7,
                memoryType: "decision",
                memoryKey: "decision:lms:database",
                normalizedValue: "postgresql",
                assertionType: "explicitly_stated",
                assertionStatus: "considered",
                sourceMessageId: id,
                evidenceExcerpt: "considering PostgreSQL",
                projectDisplayName: "LMS",
                entityDisplayName: "LMS",
                entityType: "project",
              },
            ],
            relationships: [],
            supportingMessageIds: [id],
          };
        }
        if (/migrated to PostgreSQL/i.test(content)) {
          return {
            summary: "Migrated to Postgres",
            entities: [
              {
                entityType: "project",
                displayName: "LMS",
                aliases: [],
                supportingMessageIds: [id],
              },
            ],
            facts: [
              {
                category: "decision",
                fact: "LMS database is PostgreSQL",
                confidence: 0.95,
                importance: 0.9,
                memoryType: "decision",
                memoryKey: "decision:lms:database",
                normalizedValue: "postgresql",
                assertionType: "explicitly_stated",
                assertionStatus: "confirmed",
                sourceMessageId: id,
                evidenceExcerpt: "migrated to PostgreSQL",
                projectDisplayName: "LMS",
                entityDisplayName: "LMS",
                entityType: "project",
                supersedesMemoryKey: "decision:lms:database",
              },
            ],
            relationships: [],
            supportingMessageIds: [id],
          };
        }
        return {
          summary: "Chose MySQL",
          entities: [
            {
              entityType: "project",
              displayName: "LMS",
              aliases: [],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "decision",
              fact: "LMS database will be MySQL",
              confidence: 0.9,
              importance: 0.9,
              memoryType: "decision",
              memoryKey: "decision:lms:database",
              normalizedValue: "mysql",
              assertionType: "explicitly_stated",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "database will be MySQL",
              projectDisplayName: "LMS",
              entityDisplayName: "LMS",
              entityType: "project",
            },
          ],
          relationships: [
            {
              sourceEntityDisplayName: "LMS",
              sourceEntityType: "project",
              targetEntityDisplayName: "MySQL",
              targetEntityType: "technology",
              relationshipType: "uses",
              description: "database",
              confidence: 0.9,
              sourceMessageId: id,
            },
          ],
          supportingMessageIds: [id],
        };
      },
    });

    const conversation = await conversations.create(testDb.localUserId, "LMS");
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "My LMS database will be MySQL.",
    });
    await memory.processConversation(conversation.id, testDb.localUserId);

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "I am considering PostgreSQL.",
    });
    await memory.processConversation(conversation.id, testDb.localUserId);

    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "I have migrated to PostgreSQL.",
    });
    await memory.processConversation(conversation.id, testDb.localUserId);

    const projects = await memory.projects.listProjects();
    expect(projects.some((p) => p.displayName === "LMS")).toBe(true);
    const project = projects.find((p) => p.displayName === "LMS")!;
    const timeline = await memory.projects.getTimeline(testDb.localUserId, project.id);
    expect(timeline.some((f) => /MySQL/i.test(f.fact))).toBe(true);
    expect(timeline.some((f) => /PostgreSQL/i.test(f.fact) && f.assertionStatus === "confirmed")).toBe(
      true,
    );

    const retrieved = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "What database did I originally choose, and what am I using now?",
      includeHistorical: true,
    });
    expect(retrieved.facts.length).toBeGreaterThan(0);
  });

  it("stores and retrieves preferences with evidence", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const conversations = new ConversationService(testDb.db);
    const memory = new MemoryService(testDb.db, env, {
      async extract(request) {
        const id = request.messages[0]!.id;
        return {
          summary: "Prefers concise answers",
          entities: [],
          facts: [
            {
              category: "preference",
              fact: "User prefers concise technical explanations",
              confidence: 0.92,
              importance: 0.8,
              memoryType: "preference",
              memoryKey: "preference:explanation_style",
              normalizedValue: "concise",
              assertionType: "explicitly_stated",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "prefer concise technical explanations",
            },
          ],
          relationships: [],
          supportingMessageIds: [id],
        };
      },
    });

    const conversation = await conversations.create(testDb.localUserId, "prefs");
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "I prefer concise technical explanations.",
    });
    await memory.processConversation(conversation.id, testDb.localUserId);

    const prefs = await memory.preferences.list(testDb.localUserId);
    expect(prefs.length).toBe(1);

    const hit = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "How do I prefer technical explanations?",
    });
    expect(hit.preferences.length).toBeGreaterThan(0);
  });

  it("retracts incorrect memory and excludes it from retrieval", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const conversations = new ConversationService(testDb.db);
    const memory = new MemoryService(testDb.db, env, {
      async extract(request) {
        const id = request.messages[0]!.id;
        return {
          summary: "Bunny decision",
          entities: [
            {
              entityType: "project",
              displayName: "LMS",
              aliases: [],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "decision",
              fact: "LMS stores videos in Bunny CDN",
              confidence: 0.9,
              importance: 0.8,
              memoryKey: "decision:lms:storage",
              normalizedValue: "bunny",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "stores videos in Bunny CDN",
              projectDisplayName: "LMS",
              entityType: "project",
              entityDisplayName: "LMS",
            },
          ],
          relationships: [],
          supportingMessageIds: [id],
        };
      },
    });

    const conversation = await conversations.create(testDb.localUserId, "fix");
    await conversations.addMessage(testDb.localUserId, conversation.id, {
      role: "user",
      content: "My LMS stores videos in Bunny CDN.",
    });
    await memory.processConversation(conversation.id, testDb.localUserId);
    const fact = (await memory.facts.list({ userId: testDb.localUserId, limit: 10 }))[0]!;
    const retracted = await memory.privacy.retract(testDb.localUserId, fact.id);
    expect(retracted?.assertionStatus).toBe("retracted");

    const hit = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "Where does LMS store videos?",
    });
    expect(hit.facts.every((f) => f.id !== fact.id)).toBe(true);
  });

  it("rejects sensitive content", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    const memory = new MemoryService(testDb.db, env);
    expect(memory.privacy.isSafeContent("api_key=sk-abcdefghijklmnop")).toBe(false);
    expect(memory.privacy.isSafeContent("Uses NestJS backend")).toBe(true);
  });

  it("query analyzer and supersession rules", () => {
    expect(analyzeMemoryQuery("What is my current LMS architecture?").intent).toBe(
      "architecture",
    );
    expect(analyzeMemoryQuery("How do I prefer technical explanations?").intent).toBe(
      "preference",
    );
    expect(
      shouldSupersede(baseFact({ id: "1", fact: "MySQL", assertionStatus: "confirmed" }), {
        assertionStatus: "considered",
        confidence: 0.8,
        fact: "PostgreSQL",
      }),
    ).toBe("keep_both");
    expect(
      shouldSupersede(baseFact({ id: "1", fact: "MySQL", assertionStatus: "confirmed" }), {
        assertionStatus: "confirmed",
        confidence: 0.9,
        fact: "PostgreSQL",
      }),
    ).toBe("supersede");

    const conflicts = detectConflicts([
      baseFact({
        id: "1",
        fact: "MySQL",
        normalizedValue: "mysql",
        memoryKey: "decision:db",
      }),
      baseFact({
        id: "2",
        fact: "PostgreSQL",
        normalizedValue: "postgresql",
        memoryKey: "decision:db",
      }),
    ]);
    expect(conflicts.length).toBe(1);
  });
});
