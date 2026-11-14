import { createHash, randomUUID } from "node:crypto";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../db/test-utils.js";
import { ConversationService } from "../../services/conversation.service.js";
import { ResearchRepository } from "../../repositories/research.repository.js";
import { ClaimRepository } from "../../temporal/claims/claim.repository.js";
import { FactRepository } from "../../repositories/fact.repository.js";
import { eq } from "drizzle-orm";
import {
  conversations as conversationsTable,
  messages,
  researchSources,
  type FactCategory,
} from "../../db/schema.js";
import type { EvaluationCase } from "../evaluation.schemas.js";
import type { DraftClaim } from "../../temporal/claims/claim.types.js";

const FACT_CATEGORIES = new Set<string>([
  "user_context",
  "project_context",
  "preference",
  "decision",
  "requirement",
  "goal",
  "constraint",
  "technical_context",
  "relationship",
  "research_reference",
  "other",
]);

function asFactCategory(value: string): FactCategory {
  return (FACT_CATEGORIES.has(value) ? value : "other") as FactCategory;
}

export type SeededEvaluationDatabase = {
  testDb: TestDatabase;
  conversationIds: Record<string, string>;
  snapshotIds: string[];
  sourceIdsByUrl: Record<string, string>;
  claimIds: string[];
  cleanup: () => Promise<void>;
};

function contentHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

/**
 * Isolated Postgres schema (DATABASE_URL_TEST) with real migrations, seeded from case.initialState.
 */
export async function createEvaluationDatabase(
  caseSpec: EvaluationCase,
  localUserId = `eval-user-${randomUUID()}`,
): Promise<SeededEvaluationDatabase> {
  const testDb = await createTestDatabase(localUserId);
  const conversations = new ConversationService(testDb.db);
  const research = new ResearchRepository(testDb.db);
  const claims = new ClaimRepository(testDb.db);
  const facts = new FactRepository(testDb.db);

  const conversationIds: Record<string, string> = {};
  const snapshotIds: string[] = [];
  const sourceIdsByUrl: Record<string, string> = {};
  const claimIds: string[] = [];

  const state = caseSpec.initialState;

  for (const [index, conv] of (state.conversations ?? []).entries()) {
    const key = conv.id ?? `conversation_${index}`;
    const created = await conversations.create(testDb.localUserId, conv.title);
    conversationIds[key] = created.id;
    conversationIds[conv.title] = created.id;

    for (const message of conv.messages) {
      const row = await conversations.addMessage(testDb.localUserId, created.id, {
        role: message.role,
        content: message.content,
      });
      if (message.createdAt) {
        await testDb.db
          .update(messages)
          .set({ createdAt: new Date(message.createdAt) })
          .where(eq(messages.id, row.id));
      }
    }

    if (conv.createdAt) {
      const ts = new Date(conv.createdAt);
      await testDb.db
        .update(conversationsTable)
        .set({ createdAt: ts, updatedAt: ts })
        .where(eq(conversationsTable.id, created.id));
    }
  }

  for (const snap of state.snapshots ?? []) {
    const conversationId =
      conversationIds[snap.conversationKey] ??
      Object.values(conversationIds)[0];
    if (!conversationId) {
      throw new Error(
        `Snapshot "${snap.title}" requires a seeded conversation (key=${snap.conversationKey})`,
      );
    }

    const capturedAt = new Date(snap.capturedAt);
    const created = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId,
      query: snap.query,
      title: snap.title,
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: snap.query },
      responseTimeMs: 20,
      resultCount: snap.sources.length,
      capturedAt,
      sources: snap.sources.map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        content: s.content,
        score: s.score ?? 0.9,
        publishedAt: s.publishedAt ?? null,
        retrievedAt: snap.capturedAt,
        faviconUrl: null,
        contentHash: s.contentHash ?? contentHash(s.content),
      })),
    });

    snapshotIds.push(created.snapshot.id);
    if (snap.id) {
      conversationIds[snap.id] = created.snapshot.id;
    }
    for (const source of created.sources) {
      sourceIdsByUrl[source.url] = source.id;
    }
  }

  if ((state.claims ?? []).length > 0) {
    const drafts: DraftClaim[] = [];
    for (const claim of state.claims ?? []) {
      const sourceId = sourceIdsByUrl[claim.sourceUrl];
      if (!sourceId) {
        throw new Error(
          `Claim for ${claim.entityName} references unknown sourceUrl ${claim.sourceUrl}`,
        );
      }

      const sourceRow = (
        await testDb.db
          .select({ snapshotId: researchSources.snapshotId })
          .from(researchSources)
          .where(eq(researchSources.id, sourceId))
          .limit(1)
      )[0];
      if (!sourceRow) {
        throw new Error(`Missing source for claim ${claim.entityName}`);
      }

      drafts.push({
        entityId: null,
        entityName: claim.entityName,
        category: claim.category,
        attribute: claim.attribute,
        originalValue: claim.originalValue,
        normalizedValue: claim.normalizedValue ?? claim.originalValue,
        numericValue: claim.numericValue ?? null,
        currency: claim.currency ?? null,
        billingPeriod: claim.billingPeriod ?? null,
        billingBasis: null,
        unit: null,
        planName: claim.planName ?? null,
        region: claim.region ?? null,
        seatCount: null,
        featureName: null,
        sourceId,
        snapshotId: sourceRow.snapshotId,
        sourceUrl: claim.sourceUrl,
        evidenceExcerpt: claim.evidenceExcerpt,
        contentHash: claim.contentHash ?? contentHash(claim.evidenceExcerpt),
        publishedAt: claim.publishedAt ? new Date(claim.publishedAt) : null,
        effectiveAt: claim.effectiveAt ? new Date(claim.effectiveAt) : null,
        observedAt: new Date(claim.observedAt),
        extractionConfidence: 0.95,
        extractionModel: "eval-fixture",
        verificationStatus: "verified",
      });
    }

    const inserted = await claims.insertMany(testDb.localUserId, drafts);
    claimIds.push(...inserted.map((c) => c.id));
  }

  const firstConversationId = Object.values(conversationIds)[0];
  if ((state.memoryFacts ?? []).length > 0 && firstConversationId) {
    const seedMessage = await conversations.addMessage(
      testDb.localUserId,
      firstConversationId,
      { role: "system", content: "evaluation memory seed" },
    );

    for (const fact of state.memoryFacts ?? []) {
      await facts.create({
        userId: testDb.localUserId,
        category: asFactCategory(fact.category),
        fact: fact.value,
        confidence: fact.confidence ?? 0.9,
        importance: fact.importance ?? 0.7,
        memoryKey: fact.memoryKey,
        normalizedValue: fact.value,
        sourceMessageId: seedMessage.id,
        sourceConversationId: firstConversationId,
        evidenceExcerpt: fact.value,
        entityName: fact.entityName ?? null,
      });
    }
  }

  return {
    testDb,
    conversationIds,
    snapshotIds,
    sourceIdsByUrl,
    claimIds,
    cleanup: async () => testDb.cleanup(),
  };
}
