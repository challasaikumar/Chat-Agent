import type { FastifyBaseLogger } from "fastify";
import type { AppDatabase } from "../db/index.js";
import {
  researchClaims,
  researchSources,
  researchSnapshots,
  type ClaimCategory,
} from "../db/schema.js";
import { and, eq, inArray } from "drizzle-orm";
import type { Env } from "../config/env.js";
import { evidenceConfigFromEnv, type EvidenceConfig } from "./evidence.config.js";
import { ClaimVerifier } from "./claims/claim.verifier.js";
import { EvidenceRepository } from "./evidence.repository.js";
import type {
  ClaimVerificationOutcome,
  SnapshotEvidenceReport,
} from "./evidence.types.js";
import { validateAnswerQuality } from "./quality/answer.quality.js";
import type { CitationRegistry } from "../agent/citations/citation.registry.js";
import { validateAndSanitizeAnswer } from "../agent/citations/citation.validator.js";
import type { FinalAnswer } from "../agent/agent.schemas.js";
import { detectPromptInjection } from "./security/prompt-injection.detector.js";
import { wrapUntrustedEvidence } from "./security/untrusted-content.js";

export type EvidencePipelineResult = {
  verificationOutcomes: ClaimVerificationOutcome[];
  runIds: string[];
  assessmentsCount: number;
  independentSourceCount: number;
  suspiciousSourceCount: number;
  durationMs: number;
  evidenceBriefing: string;
};

export class EvidenceService {
  private readonly config: EvidenceConfig;
  private readonly repository: EvidenceRepository;
  private readonly verifier: ClaimVerifier;

  constructor(
    private readonly db: AppDatabase,
    env: Env,
    private readonly logger: FastifyBaseLogger,
    verifier = new ClaimVerifier(),
  ) {
    this.config = evidenceConfigFromEnv(env);
    this.repository = new EvidenceRepository(db);
    this.verifier = verifier;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Internal pipeline after search + claim extraction.
   * Does not expose a new model tool.
   */
  async evaluateSnapshot(input: {
    userId: string;
    snapshotId: string;
    claimIds?: string[];
  }): Promise<EvidencePipelineResult> {
    const started = Date.now();
    if (!this.config.enabled) {
      return {
        verificationOutcomes: [],
        runIds: [],
        assessmentsCount: 0,
        independentSourceCount: 0,
        suspiciousSourceCount: 0,
        durationMs: 0,
        evidenceBriefing: "Evidence verification disabled.",
      };
    }

    this.logger.info(
      { snapshotId: input.snapshotId, userId: input.userId },
      "source assessment started",
    );

    const snapshotRows = await this.db
      .select()
      .from(researchSnapshots)
      .where(
        and(
          eq(researchSnapshots.id, input.snapshotId),
          eq(researchSnapshots.userId, input.userId),
        ),
      )
      .limit(1);
    if (!snapshotRows[0]) {
      throw new Error("Snapshot not found or not owned by user");
    }

    const sources = await this.db
      .select()
      .from(researchSources)
      .where(eq(researchSources.snapshotId, input.snapshotId));

    let claims = await this.db
      .select()
      .from(researchClaims)
      .where(
        and(
          eq(researchClaims.userId, input.userId),
          eq(researchClaims.snapshotId, input.snapshotId),
        ),
      );

    if (input.claimIds?.length) {
      claims = claims.filter((c) => input.claimIds!.includes(c.id));
    }

    claims = claims.slice(0, this.config.maxClaimsPerRun);

    const verifiableSources = sources.map((s) => ({
      id: s.id,
      userId: input.userId,
      url: s.url,
      title: s.title,
      content: (s.contentExcerpt ?? "").slice(0, this.config.maxContentLength),
      contentHash: s.contentHash,
      publishedAt: s.publishedAt,
      retrievedAt: s.retrievedAt,
      snapshotCapturedAt: snapshotRows[0]!.capturedAt,
    }));

    for (const source of verifiableSources) {
      const injection = detectPromptInjection(source.content);
      if (injection.suspicious) {
        this.logger.warn(
          {
            sourceId: source.id,
            indicators: injection.indicators,
          },
          "prompt injection indicator detected",
        );
      }
    }

    const independence = this.verifier.analyzeIndependence(verifiableSources);
    await this.repository.insertSourceRelationships({
      userId: input.userId,
      relationships: independence.relationships,
    });

    this.logger.info(
      {
        snapshotId: input.snapshotId,
        independentGroups: independence.independentSourceCount,
      },
      "independent source analysis",
    );

    const outcomes: ClaimVerificationOutcome[] = [];
    const runIds: string[] = [];
    let assessmentsCount = 0;
    let suspiciousSourceCount = 0;

    for (const claim of claims) {
      if (Date.now() - started > this.config.maxVerificationTimeMs) {
        this.logger.warn(
          { snapshotId: input.snapshotId },
          "evidence verification time budget exhausted",
        );
        break;
      }

      this.logger.info(
        { claimId: claim.id },
        "claim verification started",
      );

      const statement = `${claim.entityName} ${claim.attribute}: ${claim.originalValue}`;
      const outcome = this.verifier.verifyClaim({
        claim: {
          id: claim.id,
          statement,
          entityName: claim.entityName,
          category: claim.category as ClaimCategory,
          attribute: claim.attribute,
          value: claim.normalizedValue ?? claim.originalValue,
          planName: claim.planName,
          region: claim.region,
          unit: claim.unit,
          sourceId: claim.sourceId,
          evidenceExcerpt: claim.evidenceExcerpt,
          observationDate: claim.observedAt,
          publishedAt: claim.publishedAt,
          effectiveAt: claim.effectiveAt,
        },
        sources: verifiableSources.slice(0, this.config.maxSourcesPerClaim),
        userId: input.userId,
        relatedClaims: claims
          .filter((c) => c.id !== claim.id)
          .slice(0, 20)
          .map((c) => ({
            id: c.id,
            statement: `${c.entityName} ${c.attribute}: ${c.originalValue}`,
            entityName: c.entityName,
            category: c.category as ClaimCategory,
            attribute: c.attribute,
            value: c.normalizedValue ?? c.originalValue,
            planName: c.planName,
            region: c.region,
            unit: c.unit,
            sourceId: c.sourceId,
            evidenceExcerpt: c.evidenceExcerpt,
            observationDate: c.observedAt,
          })),
        maxSourcesPerClaim: this.config.maxSourcesPerClaim,
        minCorroborationSources: this.config.minCorroborationSources,
      });

      assessmentsCount += outcome.assessments.length;
      suspiciousSourceCount += outcome.assessments.filter(
        (a) => a.suspiciousContent,
      ).length;

      for (const assessment of outcome.assessments) {
        const source = sources.find((s) => s.id === assessment.sourceId);
        const cached =
          this.config.cacheEnabled && source
            ? await this.repository.findCachedAssessment({
                userId: input.userId,
                sourceId: assessment.sourceId,
                contentHash: source.contentHash,
                cacheTtlHours: this.config.cacheTtlHours,
              })
            : null;
        if (!cached) {
          await this.repository.insertSourceAssessment({
            userId: input.userId,
            contentHash: source?.contentHash ?? null,
            assessment,
            claimCategoryHint: claim.category,
          });
        }
      }

      const linkIds = await this.repository.insertEvidenceLinks({
        userId: input.userId,
        links: outcome.links,
      });
      const runId = await this.repository.insertVerificationRun({
        userId: input.userId,
        outcome,
        linkIds,
      });

      if (outcome.conflicts.length > 0) {
        this.logger.info(
          { claimId: claim.id, conflicts: outcome.conflicts.length },
          "contradiction detected",
        );
      }
      if (
        outcome.sufficiencyStatus === "insufficient" ||
        outcome.status === "insufficient_evidence"
      ) {
        this.logger.info({ claimId: claim.id }, "evidence insufficient");
      }

      this.logger.info(
        {
          claimId: claim.id,
          status: outcome.status,
          sufficiency: outcome.sufficiencyStatus,
        },
        "claim verification completed",
      );

      outcomes.push(outcome);
      runIds.push(runId);
    }

    this.logger.info(
      {
        snapshotId: input.snapshotId,
        sourcesAssessed: assessmentsCount,
        claimsAssessed: outcomes.length,
      },
      "source assessment completed",
    );

    const durationMs = Date.now() - started;
    return {
      verificationOutcomes: outcomes,
      runIds,
      assessmentsCount,
      independentSourceCount: independence.independentSourceCount,
      suspiciousSourceCount,
      durationMs,
      evidenceBriefing: this.buildEvidenceBriefing(outcomes),
    };
  }

  async evaluateClaimsForSnapshots(input: {
    userId: string;
    snapshotIds: string[];
  }): Promise<EvidencePipelineResult> {
    const merged: EvidencePipelineResult = {
      verificationOutcomes: [],
      runIds: [],
      assessmentsCount: 0,
      independentSourceCount: 0,
      suspiciousSourceCount: 0,
      durationMs: 0,
      evidenceBriefing: "",
    };

    for (const snapshotId of input.snapshotIds.slice(0, 5)) {
      const result = await this.evaluateSnapshot({
        userId: input.userId,
        snapshotId,
      });
      merged.verificationOutcomes.push(...result.verificationOutcomes);
      merged.runIds.push(...result.runIds);
      merged.assessmentsCount += result.assessmentsCount;
      merged.independentSourceCount = Math.max(
        merged.independentSourceCount,
        result.independentSourceCount,
      );
      merged.suspiciousSourceCount += result.suspiciousSourceCount;
      merged.durationMs += result.durationMs;
    }

    merged.evidenceBriefing = this.buildEvidenceBriefing(
      merged.verificationOutcomes,
    );
    return merged;
  }

  validateFinalAnswer(input: {
    raw: FinalAnswer;
    registry: CitationRegistry;
    verificationStatuses: ClaimVerificationOutcome["status"][];
    persistedUrls: string[];
  }) {
    const sanitized = validateAndSanitizeAnswer(input.raw, input.registry);
    const quality = validateAnswerQuality({
      answerText: sanitized.answer,
      validCitationKeys: new Set(
        input.registry.list().map((r) => r.evidenceId),
      ),
      persistedUrls: input.persistedUrls,
      verificationStatuses: input.verificationStatuses,
    });

    if (!quality.ok) {
      this.logger.warn(
        { issues: quality.issues },
        "citation validation failed",
      );
    }

    return { sanitized, quality };
  }

  async getSource(userId: string, sourceId: string) {
    return this.repository.getSourceWithAssessment({ userId, sourceId });
  }

  async getClaim(userId: string, claimId: string) {
    return this.repository.getClaimVerification({ userId, claimId });
  }

  async getVerification(userId: string, verificationId: string) {
    return this.repository.getVerificationById({ userId, verificationId });
  }

  async getSnapshotReport(
    userId: string,
    snapshotId: string,
  ): Promise<SnapshotEvidenceReport | null> {
    const report = await this.repository.buildSnapshotReport({
      userId,
      snapshotId,
    });
    if (report) {
      this.logger.info({ snapshotId }, "evidence report generated");
    }
    return report;
  }

  wrapSourceContent(content: string): string {
    return wrapUntrustedEvidence(content, this.config.maxContentLength);
  }

  private buildEvidenceBriefing(
    outcomes: ClaimVerificationOutcome[],
  ): string {
    if (outcomes.length === 0) {
      return "No claim verification outcomes available.";
    }

    const lines = outcomes.slice(0, 40).map((o) => {
      const conflicts =
        o.conflicts.length > 0
          ? ` conflicts=${o.conflicts.map((c) => c.conflictType).join(",")}`
          : "";
      return `- claim ${o.claimId}: ${o.status} / ${o.sufficiencyStatus}; support=${o.supportingSourceCount}; independent_sources=${o.independentSourceCount}; contradict=${o.contradictingSourceCount}${conflicts}`;
    });

    const gaps = outcomes.filter(
      (o) =>
        o.status === "insufficient_evidence" ||
        o.sufficiencyStatus === "insufficient",
    ).length;

    return [
      "Evidence intelligence summary (heuristic assessments — not probabilities):",
      ...lines,
      `Evidence gaps: ${gaps}`,
      "Cite only registered evidence IDs. Disclose conflicts and insufficient evidence honestly.",
    ].join("\n");
  }
}

export async function loadSourcesForUser(
  db: AppDatabase,
  userId: string,
  sourceIds: string[],
) {
  if (sourceIds.length === 0) {
    return [];
  }
  return db
    .select({
      source: researchSources,
      userId: researchSnapshots.userId,
    })
    .from(researchSources)
    .innerJoin(
      researchSnapshots,
      eq(researchSources.snapshotId, researchSnapshots.id),
    )
    .where(
      and(
        eq(researchSnapshots.userId, userId),
        inArray(researchSources.id, sourceIds),
      ),
    );
}
