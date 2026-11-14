import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { MemoryService } from "../apps/api/src/memory/memory.service.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ContextBuilder } from "../apps/api/src/agent/context/context.builder.ts";
import { loadAgentConfig } from "../apps/api/src/agent/agent.config.ts";
import { CitationRegistry } from "../apps/api/src/agent/citations/citation.registry.ts";
import { buildApp } from "../apps/api/src/app.ts";
import type { MemoryExtractionResult } from "../apps/api/src/memory/memory.types.ts";
import { describeDb } from "./helpers/db.ts";

/**
 * Multi-session memory benchmark for the hiring challenge.
 */
describeDb("Phase 06 multi-session memory benchmark", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  function extractorFor(script: Array<(msg: string, id: number) => MemoryExtractionResult>) {
    let turn = 0;
    return {
      async extract(request: {
        messages: Array<{ id: number; content: string }>;
      }): Promise<MemoryExtractionResult> {
        const last = request.messages[request.messages.length - 1]!;
        const fn = script[Math.min(turn, script.length - 1)]!;
        turn += 1;
        return fn(last.content, last.id);
      },
    };
  }

  it("scenario 1+4: LMS architecture + decision timeline", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const conversations = new ConversationService(testDb.db);
    const memory = new MemoryService(
      testDb.db,
      env,
      extractorFor([
        (content, id) => ({
          summary: "LMS stack with Bunny",
          entities: [
            {
              entityType: "project",
              displayName: "LMS SaaS",
              aliases: ["LMS"],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "technical_context",
              fact: "LMS SaaS uses React frontend",
              confidence: 0.95,
              importance: 0.9,
              memoryKey: "tech:lms:frontend",
              normalizedValue: "react",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "React frontend",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
            {
              category: "technical_context",
              fact: "LMS SaaS uses NestJS backend",
              confidence: 0.95,
              importance: 0.9,
              memoryKey: "tech:lms:backend",
              normalizedValue: "nestjs",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "NestJS backend",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
            {
              category: "decision",
              fact: "LMS SaaS database is MySQL",
              confidence: 0.95,
              importance: 0.9,
              memoryKey: "decision:lms:database",
              normalizedValue: "mysql",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "MySQL database",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
            {
              category: "decision",
              fact: "LMS SaaS stores videos in Bunny CDN",
              confidence: 0.95,
              importance: 0.9,
              memoryKey: "decision:lms:storage",
              normalizedValue: "bunny",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "Bunny CDN storage",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
          ],
          relationships: [
            {
              sourceEntityDisplayName: "LMS SaaS",
              sourceEntityType: "project",
              targetEntityDisplayName: "NestJS",
              targetEntityType: "technology",
              relationshipType: "uses",
              confidence: 0.95,
              sourceMessageId: id,
            },
          ],
          supportingMessageIds: [id],
        }),
        (_c, id) => ({
          summary: "Considering R2",
          entities: [
            {
              entityType: "project",
              displayName: "LMS SaaS",
              aliases: ["LMS"],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "decision",
              fact: "Considering Cloudflare R2 for LMS storage",
              confidence: 0.85,
              importance: 0.7,
              memoryKey: "decision:lms:storage",
              normalizedValue: "cloudflare-r2",
              assertionStatus: "considered",
              sourceMessageId: id,
              evidenceExcerpt: "considering Cloudflare R2",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
          ],
          relationships: [],
          supportingMessageIds: [id],
        }),
        (_c, id) => ({
          summary: "Migrated to R2",
          entities: [
            {
              entityType: "project",
              displayName: "LMS SaaS",
              aliases: ["LMS"],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "decision",
              fact: "LMS SaaS stores videos in Cloudflare R2",
              confidence: 0.96,
              importance: 0.95,
              memoryKey: "decision:lms:storage",
              normalizedValue: "cloudflare-r2",
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: "migrated to Cloudflare R2",
              projectDisplayName: "LMS SaaS",
              entityType: "project",
              entityDisplayName: "LMS SaaS",
            },
          ],
          relationships: [
            {
              sourceEntityDisplayName: "LMS SaaS",
              sourceEntityType: "project",
              targetEntityDisplayName: "Cloudflare R2",
              targetEntityType: "service",
              relationshipType: "stores_videos_in",
              confidence: 0.95,
              sourceMessageId: id,
            },
          ],
          supportingMessageIds: [id],
        }),
      ]),
    );

    const c1 = await conversations.create(testDb.localUserId, "Nov 3");
    await conversations.addMessage(testDb.localUserId, c1.id, {
      role: "user",
      content:
        "My LMS SaaS uses React, NestJS, MySQL, and Bunny CDN for video storage.",
    });
    await memory.processConversation(c1.id, testDb.localUserId);

    const c2 = await conversations.create(testDb.localUserId, "Nov 8");
    await conversations.addMessage(testDb.localUserId, c2.id, {
      role: "user",
      content: "For the LMS I am considering Cloudflare R2.",
    });
    await memory.processConversation(c2.id, testDb.localUserId);

    const c3 = await conversations.create(testDb.localUserId, "Nov 13");
    await conversations.addMessage(testDb.localUserId, c3.id, {
      role: "user",
      content: "I have migrated the LMS to Cloudflare R2.",
    });
    await memory.processConversation(c3.id, testDb.localUserId);

    const current = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "What is my current LMS architecture?",
    });
    const blob = JSON.stringify(current.facts.map((f) => f.fact)).toLowerCase();
    expect(blob).toContain("react");
    expect(blob).toContain("nestjs");
    expect(blob).toContain("mysql");
    expect(blob).toMatch(/cloudflare|r2/);

    const history = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "What database did I originally choose, and what am I using now?",
      includeHistorical: true,
    });
    expect(history.facts.some((f) => /mysql/i.test(f.fact))).toBe(true);

    // New conversation continuity via ContextBuilder
    const followUp = await conversations.create(testDb.localUserId, "Follow-up");
    const msg = await conversations.addMessage(testDb.localUserId, followUp.id, {
      role: "user",
      content: "What is my current LMS architecture?",
    });
    const built = await new ContextBuilder(
      testDb.db,
      env,
      loadAgentConfig(env),
    ).build({
      userId: testDb.localUserId,
      conversationId: followUp.id,
      userMessageId: msg.id,
      userMessage: msg.content,
      timeZone: "Asia/Kolkata",
      registry: new CitationRegistry(),
    });
    expect(built.promptText.toLowerCase()).toMatch(/react|nestjs|lms/);
  });

  it("scenario 3: multi-project NestJS separation", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const conversations = new ConversationService(testDb.db);
    let step = 0;
    const memory = new MemoryService(testDb.db, env, {
      async extract(request) {
        const id = request.messages[0]!.id;
        const projects = [
          {
            name: "LMS SaaS",
            tech: "NestJS",
            key: "tech:lms:backend",
          },
          {
            name: "Company Website",
            tech: "Next.js",
            key: "tech:website:frontend",
          },
          {
            name: "AI Interview Platform",
            tech: "Python",
            key: "tech:interview:backend",
          },
        ];
        const project = projects[step++]!;
        return {
          summary: project.name,
          entities: [
            {
              entityType: "project",
              displayName: project.name,
              aliases: [],
              supportingMessageIds: [id],
            },
          ],
          facts: [
            {
              category: "technical_context",
              fact: `${project.name} uses ${project.tech}`,
              confidence: 0.95,
              importance: 0.9,
              memoryKey: project.key,
              normalizedValue: project.tech.toLowerCase(),
              assertionStatus: "confirmed",
              sourceMessageId: id,
              evidenceExcerpt: `uses ${project.tech}`,
              projectDisplayName: project.name,
              entityType: "project",
              entityDisplayName: project.name,
            },
          ],
          relationships: [
            {
              sourceEntityDisplayName: project.name,
              sourceEntityType: "project",
              targetEntityDisplayName: project.tech,
              targetEntityType: "technology",
              relationshipType: "uses",
              confidence: 0.95,
              sourceMessageId: id,
            },
          ],
          supportingMessageIds: [id],
        };
      },
    });

    for (const title of ["p1", "p2", "p3"]) {
      const c = await conversations.create(testDb.localUserId, title);
      await conversations.addMessage(testDb.localUserId, c.id, {
        role: "user",
        content: `Project details for ${title}`,
      });
      await memory.processConversation(c.id, testDb.localUserId);
    }

    const hit = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "Which project uses NestJS?",
    });
    const text = JSON.stringify(hit).toLowerCase();
    expect(text).toContain("lms");
    expect(text).toContain("nestjs");
  });

  it("scenario 6: missing information stays empty", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test", LOCAL_USER_ID: testDb.localUserId });
    const memory = new MemoryService(testDb.db, env);
    const hit = await memory.advancedRetrieval.retrieve({
      userId: testDb.localUserId,
      query: "What cloud provider did I choose?",
    });
    expect(hit.facts.length).toBe(0);
  });

  it("scenario 5 + API: overview and fact retraction endpoints", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({
      NODE_ENV: "test",
      LOCAL_USER_ID: testDb.localUserId,
    });
    const app = await buildApp({
      env,
      database: {
        db: testDb.db,
        databasePath: testDb.path,
        localUserId: testDb.localUserId,
      },
      memoryExtractor: {
        async extract(request) {
          const id = request.messages[0]!.id;
          return {
            summary: "Bunny",
            entities: [],
            facts: [
              {
                category: "decision",
                fact: "Selected Bunny CDN",
                confidence: 0.9,
                sourceMessageId: id,
                evidenceExcerpt: "Selected Bunny CDN",
                memoryKey: "decision:storage",
                assertionStatus: "confirmed",
              },
            ],
            relationships: [],
            supportingMessageIds: [id],
          };
        },
      },
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: { title: "corr" },
    });
    const conversationId = created.json().data.id as string;
    await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/messages`,
      payload: { role: "user", content: "I selected Bunny CDN" },
    });
    await app.inject({
      method: "POST",
      url: "/api/memory/process",
      payload: { conversationId },
    });

    const overview = await app.inject({ method: "GET", url: "/api/memory/overview" });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().data.counts.active).toBeGreaterThan(0);

    const facts = await app.inject({ method: "GET", url: "/api/memory/facts" });
    const factId = facts.json().data.items[0].id as string;
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/memory/facts/${factId}`,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().data.assertionStatus).toBe("retracted");

    await app.close();
  });
});
