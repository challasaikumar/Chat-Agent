import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type { ResearchSnapshot, ResearchSource } from "../db/schema.js";
import { EntityRepository } from "../repositories/entity.repository.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { loadTemporalConfig } from "./temporal.config.js";
import { TemporalIntentParser } from "./intent/temporal-intent.parser.js";
import { TemporalIntentResolver } from "./intent/temporal-intent.resolver.js";
import { HistoricalBaselineService } from "./historical-baseline.service.js";
import { EntityResolver } from "./entities/entity-matcher.js";
import { HeuristicClaimExtractor } from "./claims/claim.extractor.js";
import { OpenAiClaimExtractor } from "./claims/claim.extractor.openai.js";
import { ClaimRepository } from "./claims/claim.repository.js";
import { validateDraftClaim } from "./claims/claim.validator.js";
import { ComparisonService } from "./comparison/comparison.service.js";
import { TemporalRepository } from "./temporal.repository.js";
import type {
  TemporalComparisonView,
  TemporalPrepareResult,
  TemporalTimings,
} from "./temporal.types.js";

export class TemporalService {
  private readonly config;
  private readonly intentParser = new TemporalIntentParser();
  private readonly intentResolver = new TemporalIntentResolver();
  private readonly baseline: HistoricalBaselineService;
  private readonly entities: EntityRepository;
  private readonly research: ResearchRepository;
  private readonly claims: ClaimRepository;
  private readonly comparisons: ComparisonService;
  private readonly temporalRepo: TemporalRepository;
  private readonly heuristic = new HeuristicClaimExtractor();
  private readonly openaiExtractor: OpenAiClaimExtractor;
  private readonly entityResolver = new EntityResolver();

  constructor(
    private readonly db: AppDatabase,
    private readonly env: Env,
  ) {
    this.config = loadTemporalConfig(env);
    this.baseline = new HistoricalBaselineService(db, this.config);
    this.entities = new EntityRepository(db);
    this.research = new ResearchRepository(db);
    this.claims = new ClaimRepository(db);
    this.comparisons = new ComparisonService(db, this.config);
    this.temporalRepo = new TemporalRepository(db);
    this.openaiExtractor = new OpenAiClaimExtractor(env);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  async prepareTurn(options: {
    userId: string;
    conversationId: string;
    message: string;
    timeZone: string;
    now?: Date;
  }): Promise<TemporalPrepareResult & { timings: Pick<TemporalTimings, "intentMs" | "baselineMs"> }> {
    const intentStarted = Date.now();
    let intent = this.intentParser.parse(options.message, {
      timeZone: options.timeZone,
      now: options.now,
    });
    const intentMs = Date.now() - intentStarted;

    const knownEntities = await this.entities.listForConversation(options.conversationId);
    const entityNames = Array.from(
      new Set([
        ...intent.comparisonTargets,
        ...knownEntities.map((e) => e.displayName),
      ]),
    );

    const baselineStarted = Date.now();
    // provisional snapshots for previous_research resolution
    const provisional = await this.baseline.findBaseline({
      userId: options.userId,
      conversationId: options.conversationId,
      intent,
      entityNames,
    });

    intent = this.intentResolver.resolve({
      intent,
      historicalSnapshots: provisional.snapshots,
      latestMessageAt: provisional.messages[0]?.createdAt ?? null,
      now: options.now,
    });

    const baseline = await this.baseline.findBaseline({
      userId: options.userId,
      conversationId: options.conversationId,
      intent,
      entityNames,
    });
    const baselineMs = Date.now() - baselineStarted;

    const needsCurrentResearch =
      intent.isComparison &&
      (intent.changeCategories.includes("pricing") ||
        intent.changeCategories.includes("features") ||
        intent.changeCategories.includes("product_updates") ||
        /today|now|current|changed|shipped/i.test(options.message));

    return {
      intent,
      baselineSummary: [
        "## Historical baseline (backend-retrieved)",
        baseline.summary,
        baseline.facts.length
          ? `Related facts: ${baseline.facts.map((f) => f.fact).join("; ")}`
          : "",
        intent.ambiguous && intent.ambiguityReason
          ? `Ambiguity: ${intent.ambiguityReason}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
      historicalSnapshotIds: baseline.snapshots.map((s) => s.id),
      entityNames,
      needsCurrentResearch,
      timings: { intentMs, baselineMs },
    };
  }

  async extractClaimsForSnapshots(options: {
    userId: string;
    snapshots: ResearchSnapshot[];
    entityHint?: string | null;
    useOpenAi?: boolean;
  }): Promise<number> {
    let inserted = 0;
    for (const snapshot of options.snapshots) {
      const sources = await this.research.listSourcesForSnapshot(snapshot.id);
      for (const source of sources) {
        if ((await this.claims.listForSource(source.id)).length > 0) {
          continue; // idempotent skip
        }
        inserted += await this.extractAndPersistSource({
          userId: options.userId,
          source,
          snapshotId: snapshot.id,
          entityHint: options.entityHint,
          useOpenAi: options.useOpenAi,
        });
      }
    }
    return inserted;
  }

  async extractAndPersistSource(options: {
    userId: string;
    source: ResearchSource;
    snapshotId: string;
    entityHint?: string | null;
    useOpenAi?: boolean;
  }): Promise<number> {
    if ((await this.claims.listForSource(options.source.id)).length > 0) {
      return 0;
    }

    let drafts = this.heuristic.extractFromSource({
      source: options.source,
      snapshotId: options.snapshotId,
      entityHint: options.entityHint,
    });

    if (options.useOpenAi) {
      const llm = await this.openaiExtractor.extract({
        source: options.source,
        snapshotId: options.snapshotId,
        entityHint: options.entityHint,
        minConfidence: this.config.minExtractionConfidence,
      });
      if (llm.length > 0) {
        drafts = [...drafts, ...llm];
      }
    }

    const validated = drafts.filter((draft) => {
      const result = validateDraftClaim(
        draft,
        this.config.minExtractionConfidence,
      );
      return result.ok && draft.verificationStatus !== "rejected";
    });

    for (const draft of validated) {
      const existing = await this.entities.findByTypeAndCanonical(
        "company",
        draft.entityName,
      ) ?? await this.entities.findByTypeAndCanonical("product", draft.entityName)
        ?? await this.entities.findByTypeAndCanonical("service", draft.entityName);
      if (existing) {
        draft.entityId = existing.id;
        draft.entityName = existing.displayName;
      }
    }

    return (await this.claims.insertMany(options.userId, validated)).length;
  }

  async finalizeComparison(options: {
    userId: string;
    conversationId: string;
    agentRunId?: string | null;
    prepare: TemporalPrepareResult;
    currentSnapshotIds?: string[];
    now?: Date;
  }): Promise<TemporalComparisonView | null> {
    if (!this.config.enabled || !options.prepare.intent.isComparison) {
      return null;
    }

    const historicalSnapshots = (
      await Promise.all(
        options.prepare.historicalSnapshotIds.map((id) =>
          this.research.findSnapshotForUser(id, options.userId),
        ),
      )
    ).filter((s): s is ResearchSnapshot => Boolean(s));

    await this.extractClaimsForSnapshots({
      userId: options.userId,
      snapshots: historicalSnapshots,
      entityHint: options.prepare.entityNames[0] ?? null,
      useOpenAi: false,
    });

    const currentIds = options.currentSnapshotIds ?? [];
    const currentSnapshots = (
      await Promise.all(
        currentIds.map((id) =>
          this.research.findSnapshotForUser(id, options.userId),
        ),
      )
    ).filter((s): s is ResearchSnapshot => Boolean(s));

    await this.extractClaimsForSnapshots({
      userId: options.userId,
      snapshots: currentSnapshots,
      entityHint: options.prepare.entityNames[0] ?? null,
      useOpenAi: false,
    });

    // If no new current snapshots, use other conversation snapshots after the baseline
    let currentClaims = await this.claims.listForUser(options.userId, {
      snapshotIds: currentSnapshots.map((s) => s.id),
      limit: this.config.maxClaimsPerComparison,
    });

    if (currentClaims.length === 0) {
      const recent = await this.research.listSnapshotsSimple(options.userId, {
        conversationId: options.conversationId,
        limit: 5,
      });
      const baselineTime =
        historicalSnapshots[0]?.capturedAt?.getTime() ?? 0;
      const newer = recent.filter((s) => s.capturedAt.getTime() > baselineTime);
      await this.extractClaimsForSnapshots({
        userId: options.userId,
        snapshots: newer,
        useOpenAi: false,
      });
      currentClaims = await this.claims.listForUser(options.userId, {
        snapshotIds: newer.map((s) => s.id),
        limit: this.config.maxClaimsPerComparison,
      });
    }

    const historicalClaims = await this.claims.listForUser(options.userId, {
      snapshotIds: historicalSnapshots.map((s) => s.id),
      limit: this.config.maxClaimsPerComparison,
    });

    return this.comparisons.runAndPersist({
      userId: options.userId,
      conversationId: options.conversationId,
      agentRunId: options.agentRunId,
      comparisonType: options.prepare.intent.changeCategories.join(",") || "general",
      referenceFrom: options.prepare.intent.startDate,
      referenceTo: options.prepare.intent.comparisonDate,
      timeZone: options.prepare.intent.timeZone,
      historical: historicalClaims,
      current: currentClaims,
      baselineDate: historicalSnapshots[0]?.capturedAt ?? null,
    });
  }

  async preview(options: {
    userId: string;
    conversationId: string;
    entityNames: string[];
    fromDate?: string;
    toDate?: string;
    timeZone: string;
    categories?: string[];
  }): Promise<TemporalComparisonView> {
    const messageParts = [
      options.entityNames.join(", "),
      options.fromDate ? `since ${options.fromDate}` : "",
      options.categories?.includes("pricing") ? "pricing" : "",
      options.categories?.includes("features") ? "features" : "",
      "has anything changed",
    ];
    const prepare = await this.prepareTurn({
      userId: options.userId,
      conversationId: options.conversationId,
      message: messageParts.filter(Boolean).join(" "),
      timeZone: options.timeZone,
    });

    if (options.fromDate) {
      prepare.intent.startDate = options.fromDate;
      prepare.intent.endDate = options.toDate ?? options.fromDate;
      prepare.intent.referenceType = "explicit_date";
      prepare.intent.ambiguous = false;
    }

    const baseline = await this.baseline.findBaseline({
      userId: options.userId,
      conversationId: options.conversationId,
      intent: prepare.intent,
      entityNames: options.entityNames,
    });

    void this.extractClaimsForSnapshots({
      userId: options.userId,
      snapshots: baseline.snapshots,
      useOpenAi: false,
    });

    const recent = await this.research.listSnapshotsSimple(options.userId, {
      conversationId: options.conversationId,
      limit: 5,
    });
    void this.extractClaimsForSnapshots({
      userId: options.userId,
      snapshots: recent,
      useOpenAi: false,
    });

    const historicalClaims = await this.claims.listForUser(options.userId, {
      snapshotIds: baseline.snapshots.map((s) => s.id),
      limit: this.config.maxClaimsPerComparison,
    });
    const currentClaims = await this.claims.listForUser(options.userId, {
      snapshotIds: recent
        .filter(
          (s) =>
            !baseline.snapshots.some((b) => b.id === s.id) ||
            (options.toDate
              ? s.capturedAt >= new Date(`${options.toDate}T00:00:00.000Z`)
              : true),
        )
        .map((s) => s.id),
      limit: this.config.maxClaimsPerComparison,
    });

    return this.comparisons.runAndPersist({
      userId: options.userId,
      conversationId: options.conversationId,
      comparisonType: (options.categories ?? ["general"]).join(","),
      referenceFrom: options.fromDate ?? prepare.intent.startDate,
      referenceTo: options.toDate ?? prepare.intent.comparisonDate,
      timeZone: options.timeZone,
      historical: historicalClaims,
      current: currentClaims,
      baselineDate: baseline.preferredCapturedAt,
    });
  }

  async getClaim(userId: string, id: string) {
    return this.claims.findByIdForUser(id, userId);
  }

  async listClaims(userId: string, limit = 50) {
    return this.claims.listForUser(userId, { limit });
  }

  async getComparison(userId: string, id: string) {
    return this.temporalRepo.findComparisonForUser(id, userId);
  }

  async listComparisons(userId: string, limit = 50, conversationId?: string) {
    return this.temporalRepo.listComparisonsForUser(userId, {
      limit,
      conversationId,
    });
  }

  async listComparisonItems(comparisonId: string) {
    return this.temporalRepo.listItems(comparisonId);
  }

  async entityTimeline(userId: string, entityId: string) {
    return this.claims.listForUser(userId, {
      entityId,
      limit: this.config.maxClaimsPerComparison,
    });
  }
}
