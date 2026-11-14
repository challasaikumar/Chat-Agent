import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../apps/api/src/db/test-utils.ts";
import { ConversationService } from "../apps/api/src/services/conversation.service.ts";
import { ResearchRepository } from "../apps/api/src/repositories/research.repository.ts";
import { ClaimRepository } from "../apps/api/src/temporal/claims/claim.repository.ts";
import { ComparisonEngine } from "../apps/api/src/temporal/comparison/comparison.engine.ts";
import { compareFeatures } from "../apps/api/src/temporal/comparison/comparison.features.ts";
import type { ResearchClaim } from "../apps/api/src/db/schema.ts";
import { HeuristicClaimExtractor } from "../apps/api/src/temporal/claims/claim.extractor.ts";
import { HistoricalBaselineService } from "../apps/api/src/temporal/historical-baseline.service.ts";
import { loadTemporalConfig } from "../apps/api/src/temporal/temporal.config.ts";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { TemporalIntentParser } from "../apps/api/src/temporal/intent/temporal-intent.parser.ts";
import { describeDb } from "./helpers/db.ts";

function baseClaim(
  overrides: Partial<ResearchClaim> & Pick<ResearchClaim, "id" | "entityName" | "originalValue">,
): ResearchClaim {
  return {
    userId: "u",
    entityId: null,
    category: "pricing",
    attribute: "list_price",
    normalizedValue: null,
    numericValue: "20.00",
    currency: "USD",
    billingPeriod: "month",
    billingBasis: "monthly",
    unit: "flat",
    planName: "Pro",
    region: null,
    seatCount: null,
    featureName: null,
    sourceId: "src",
    snapshotId: "snap",
    sourceUrl: "https://example.com/p",
    evidenceExcerpt: overrides.originalValue,
    contentHash: overrides.id,
    publishedAt: null,
    effectiveAt: null,
    observedAt: new Date("2026-11-01T00:00:00.000Z"),
    extractionConfidence: 0.9,
    extractionModel: "test",
    verificationStatus: "verified",
    createdAt: new Date(),
    ...overrides,
  };
}

describeDb("comparison engine", () => {
  let testDb: TestDatabase;

  afterEach(async () => {
    await testDb?.cleanup();
  });

  it("classifies price increase and conflicting current evidence", () => {
    const engine = new ComparisonEngine();
    const result = engine.compare({
      historical: [
        baseClaim({
          id: "h1",
          entityName: "Neon",
          originalValue: "$19/month",
          numericValue: "19.00",
        }),
      ],
      current: [
        baseClaim({
          id: "c1",
          entityName: "Neon",
          originalValue: "$25/month",
          numericValue: "25.00",
          observedAt: new Date("2026-11-13T00:00:00.000Z"),
        }),
        baseClaim({
          id: "c2",
          entityName: "Neon",
          originalValue: "$29/month",
          numericValue: "29.00",
          observedAt: new Date("2026-11-13T00:00:00.000Z"),
        }),
      ],
      baselineDate: new Date("2026-11-01T00:00:00.000Z"),
    });

    expect(result.items.some((i) => i.changeType === "PRICE_INCREASED")).toBe(true);
    expect(result.items.some((i) => i.changeType === "CONFLICTING_EVIDENCE")).toBe(true);
    expect(result.verdict).toBe("CONFLICTING_INFORMATION");
  });

  it("returns insufficient evidence without historical claims", () => {
    const engine = new ComparisonEngine();
    const result = engine.compare({
      historical: [],
      current: [
        baseClaim({
          id: "c1",
          entityName: "Neon",
          originalValue: "$25",
          numericValue: "25.00",
        }),
      ],
      baselineDate: null,
    });
    expect(result.status).toBe("insufficient_evidence");
    expect(result.verdict).toBe("INSUFFICIENT_HISTORICAL_EVIDENCE");
  });

  it("detects dated feature additions vs undated unknowns", () => {
    const baseline = new Date("2026-11-03T00:00:00.000Z");
    const items = compareFeatures({
      historical: [],
      current: [
        baseClaim({
          id: "f1",
          entityName: "Supabase",
          category: "product_release",
          attribute: "feature_added",
          originalValue: "Supabase launched Branching GA",
          numericValue: null,
          currency: null,
          billingPeriod: null,
          featureName: "Branching GA",
          effectiveAt: new Date("2026-11-10T00:00:00.000Z"),
          publishedAt: new Date("2026-11-10T00:00:00.000Z"),
        }),
        baseClaim({
          id: "f2",
          entityName: "Supabase",
          category: "feature",
          attribute: "feature_added",
          originalValue: "Dashboard polish",
          numericValue: null,
          currency: null,
          billingPeriod: null,
          featureName: "Dashboard polish",
          effectiveAt: null,
          publishedAt: null,
        }),
      ],
      baselineDate: baseline,
    });

    expect(items.some((i) => i.changeType === "PRODUCT_RELEASED" || i.changeType === "FEATURE_ADDED")).toBe(
      true,
    );
    expect(items.some((i) => i.changeType === "UNKNOWN")).toBe(true);
  });

  it("retrieves exact previous snapshot as baseline", async () => {
    testDb = await createTestDatabase();
    const env = loadEnvironment({ NODE_ENV: "test" });
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const conversation = await conversations.create(testDb.localUserId, "baseline");
    const monday = new Date("2026-11-09T09:00:00.000Z");

    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "HubSpot Salesforce Pipedrive pricing",
      title: "CRM pricing",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "CRM" },
      responseTimeMs: 10,
      resultCount: 1,
      capturedAt: monday,
      sources: [
        {
          title: "HubSpot",
          url: "https://www.hubspot.com/pricing",
          domain: "www.hubspot.com",
          content: "HubSpot Professional $800 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: monday.toISOString(),
          faviconUrl: null,
          contentHash: "b1",
        },
      ],
    });

    // unrelated newer snapshot
    await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "weather in paris",
      title: "weather",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "weather" },
      responseTimeMs: 10,
      resultCount: 1,
      capturedAt: new Date("2026-11-13T09:00:00.000Z"),
      sources: [
        {
          title: "Weather",
          url: "https://example.com/weather",
          domain: "example.com",
          content: "Sunny",
          score: 0.5,
          publishedAt: null,
          retrievedAt: new Date().toISOString(),
          faviconUrl: null,
          contentHash: "w1",
        },
      ],
    });

    const intent = new TemporalIntentParser().parse(
      "On Monday we shortlisted HubSpot. Has pricing changed?",
      { timeZone: "Asia/Kolkata", now: new Date("2026-11-13T10:00:00.000Z") },
    );

    const baseline = await new HistoricalBaselineService(
      testDb.db,
      loadTemporalConfig(env),
    ).findBaseline({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      intent,
      entityNames: ["HubSpot"],
    });

    expect(baseline.snapshots.length).toBeGreaterThan(0);
    expect(baseline.snapshots[0]!.query).toContain("HubSpot");
    expect(baseline.snapshots[0]!.query).not.toContain("weather");
  });

  it("persists claims and compares historical vs current snapshots", async () => {
    testDb = await createTestDatabase();
    const conversations = new ConversationService(testDb.db);
    const research = new ResearchRepository(testDb.db);
    const claims = new ClaimRepository(testDb.db);
    const extractor = new HeuristicClaimExtractor();
    const conversation = await conversations.create(testDb.localUserId, "cmp");

    const hist = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon pricing",
      title: "Neon hist",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "Neon" },
      responseTimeMs: 10,
      resultCount: 1,
      capturedAt: new Date("2026-11-04T00:00:00.000Z"),
      sources: [
        {
          title: "Neon old",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Neon Pro $19 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: "2026-11-04T00:00:00.000Z",
          faviconUrl: null,
          contentHash: "old",
        },
      ],
    });

    const curr = await research.createSnapshotWithSources({
      userId: testDb.localUserId,
      conversationId: conversation.id,
      query: "Neon pricing",
      title: "Neon curr",
      provider: "tavily",
      providerRequestId: null,
      searchParameters: { query: "Neon" },
      responseTimeMs: 10,
      resultCount: 1,
      capturedAt: new Date("2026-11-13T00:00:00.000Z"),
      sources: [
        {
          title: "Neon new",
          url: "https://neon.tech/pricing",
          domain: "neon.tech",
          content: "Neon Pro $25 per month",
          score: 0.9,
          publishedAt: null,
          retrievedAt: "2026-11-13T00:00:00.000Z",
          faviconUrl: null,
          contentHash: "new",
        },
      ],
    });

    await claims.insertMany(
      testDb.localUserId,
      extractor.extractFromSource({
        source: hist.sources[0]!,
        snapshotId: hist.snapshot.id,
        entityHint: "Neon",
      }),
    );
    await claims.insertMany(
      testDb.localUserId,
      extractor.extractFromSource({
        source: curr.sources[0]!,
        snapshotId: curr.snapshot.id,
        entityHint: "Neon",
      }),
    );

    const historical = await claims.listForUser(testDb.localUserId, {
      snapshotIds: [hist.snapshot.id],
    });
    const current = await claims.listForUser(testDb.localUserId, {
      snapshotIds: [curr.snapshot.id],
    });

    const result = new ComparisonEngine().compare({
      historical,
      current,
      baselineDate: hist.snapshot.capturedAt,
    });

    expect(result.items.some((i) => i.changeType === "PRICE_INCREASED")).toBe(true);
    expect(result.verdict).toBe("CONFIRMED_CHANGE");
  });
});
