import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { HeuristicClaimExtractor } from "../apps/api/src/temporal/claims/claim.extractor.ts";
import { ClaimRepository } from "../apps/api/src/temporal/claims/claim.repository.ts";
import { validateDraftClaim } from "../apps/api/src/temporal/claims/claim.validator.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { TemporalService } from "../apps/api/src/temporal/temporal.service.ts";
import { describeDb } from "./helpers/db.ts";

describeDb("claim extraction", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("extracts pricing and feature claims from source text", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "claims");
    const { snapshot, sources } = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot pricing",
      title: "HubSpot",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "HubSpot pricing" },
      responseTimeMs: 10,
      resultCount: 1,
      sources: [
        {
          title: "HubSpot Pricing",
          url: "https://www.hubspot.com/pricing",
          domain: "www.hubspot.com",
          content:
            "HubSpot Professional plan costs $800 per month. HubSpot launched AI Assistants in 2026.",
          score: 0.9,
          publishedAt: "2026-11-01T00:00:00.000Z",
          retrievedAt: new Date().toISOString(),
          faviconUrl: null,
          contentHash: "h1",
        },
      ],
    });

    const extractor = new HeuristicClaimExtractor();
    const drafts = extractor.extractFromSource({
      source: sources[0]!,
      snapshotId: snapshot.id,
      entityHint: "HubSpot",
    });

    expect(drafts.some((d) => d.category === "pricing")).toBe(true);
    expect(drafts.some((d) => d.numericValue === "800.00")).toBe(true);
    expect(drafts.every((d) => d.sourceId === sources[0]!.id)).toBe(true);
    expect(drafts.every((d) => validateDraftClaim(d, 0.6).ok)).toBe(true);

    const repo = new ClaimRepository(testDb.db);
    const inserted = await repo.insertMany(testDb.localUserId, drafts);
    const again = await repo.insertMany(testDb.localUserId, drafts);
    expect(inserted.length).toBeGreaterThan(0);
    expect(again.map((c) => c.id).sort()).toEqual(inserted.map((c) => c.id).sort());
  });

  it("rejects claims below min confidence", () => {
    const draft = {
      entityId: null,
      entityName: "X",
      category: "pricing" as const,
      attribute: "list_price",
      originalValue: "$1",
      normalizedValue: "1.00|USD",
      numericValue: "1.00",
      currency: "USD",
      billingPeriod: "month",
      billingBasis: "monthly",
      unit: "flat",
      planName: null,
      region: null,
      seatCount: null,
      featureName: null,
      sourceId: "s",
      snapshotId: "snap",
      sourceUrl: "https://example.com",
      evidenceExcerpt: "$1",
      contentHash: "c",
      publishedAt: null,
      effectiveAt: null,
      observedAt: new Date(),
      extractionConfidence: 0.1,
      extractionModel: "test",
      verificationStatus: "verified" as const,
    };
    expect(validateDraftClaim(draft, 0.6).ok).toBe(false);
  });

  it("TemporalService extract is idempotent per source", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "idem");
    const { snapshot, sources } = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon pricing",
      title: "Neon",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "Neon" },
      responseTimeMs: 5,
      resultCount: 1,
      sources: [
        {
          title: "Neon",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Neon Pro is $19 per month.",
          score: 0.8,
          publishedAt: null,
          retrievedAt: new Date().toISOString(),
          faviconUrl: null,
          contentHash: "n1",
        },
      ],
    });

    const temporal = new TemporalService(testDb.db, env);
    const first = await temporal.extractAndPersistSource({
      userId: testDb.localUserId,
      source: sources[0]!,
      snapshotId: snapshot.id,
      entityHint: "Neon",
    });
    const second = await temporal.extractAndPersistSource({
      userId: testDb.localUserId,
      source: sources[0]!,
      snapshotId: snapshot.id,
      entityHint: "Neon",
    });
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
});
