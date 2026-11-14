import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import {
  claimEvidenceLinks,
  claimVerificationResults,
  claimVerificationRuns,
  researchClaims,
  researchSources,
  researchSnapshots,
  sourceAssessments,
  sourceRelationships,
} from "../db/schema.js";
import type {
  ClaimEvidenceLinkResult,
  ClaimVerificationOutcome,
  SourceAssessmentResult,
  SourcePairRelationship,
  SnapshotEvidenceReport,
} from "./evidence.types.js";

export class EvidenceRepository {
  constructor(private readonly db: AppDatabase) {}

  async findCachedAssessment(input: {
    userId: string;
    sourceId: string;
    contentHash: string | null;
    cacheTtlHours: number;
  }): Promise<typeof sourceAssessments.$inferSelect | null> {
    if (!input.contentHash) {
      return null;
    }
    const cutoff = new Date(
      Date.now() - input.cacheTtlHours * 60 * 60 * 1000,
    );
    const rows = await this.db
      .select()
      .from(sourceAssessments)
      .where(
        and(
          eq(sourceAssessments.userId, input.userId),
          eq(sourceAssessments.sourceId, input.sourceId),
          eq(sourceAssessments.contentHash, input.contentHash),
          gte(sourceAssessments.assessedAt, cutoff),
        ),
      )
      .orderBy(desc(sourceAssessments.assessedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async insertSourceAssessment(input: {
    userId: string;
    contentHash: string | null;
    assessment: SourceAssessmentResult;
    claimCategoryHint?: string | null;
  }): Promise<string> {
    const id = randomUUID();
    await this.db.insert(sourceAssessments).values({
      id,
      userId: input.userId,
      sourceId: input.assessment.sourceId,
      contentHash: input.contentHash,
      sourceType: input.assessment.sourceType,
      publisherRelationship: input.assessment.publisherRelationship,
      authorityScore: input.assessment.authorityScore,
      relevanceScore: input.assessment.relevanceScore,
      transparencyScore: input.assessment.transparencyScore,
      freshnessScore: input.assessment.freshnessScore,
      directnessScore: input.assessment.directnessScore,
      overallSuitabilityScore: input.assessment.overallSuitabilityScore,
      freshnessCategory: input.assessment.freshnessCategory,
      assessmentStatus: input.assessment.assessmentStatus,
      assessmentReasons: input.assessment.reasons,
      claimCategoryHint: input.claimCategoryHint ?? null,
      suspiciousContent: input.assessment.suspiciousContent,
      assessedAt: new Date(input.assessment.assessedAt),
    });
    return id;
  }

  async insertSourceRelationships(input: {
    userId: string;
    relationships: SourcePairRelationship[];
  }): Promise<void> {
    for (const rel of input.relationships) {
      const id = randomUUID();
      try {
        await this.db.insert(sourceRelationships).values({
          id,
          userId: input.userId,
          sourceId: rel.sourceId,
          relatedSourceId: rel.relatedSourceId,
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
        });
      } catch {
        // Unique constraint — idempotent write.
      }
    }
  }

  async insertEvidenceLinks(input: {
    userId: string;
    links: ClaimEvidenceLinkResult[];
  }): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const link of input.links) {
      const id = randomUUID();
      const key = `${link.claimId}:${link.sourceId}:${link.relationship}`;
      try {
        await this.db.insert(claimEvidenceLinks).values({
          id,
          userId: input.userId,
          claimId: link.claimId,
          sourceId: link.sourceId,
          relationship: link.relationship,
          evidenceExcerpt: link.evidenceExcerpt,
          directness: link.directness,
          confidence: link.confidence,
          reasoningSummary: link.reasoningSummary,
        });
        ids.set(key, id);
      } catch {
        const existing = await this.db
          .select({ id: claimEvidenceLinks.id })
          .from(claimEvidenceLinks)
          .where(
            and(
              eq(claimEvidenceLinks.claimId, link.claimId),
              eq(claimEvidenceLinks.sourceId, link.sourceId),
              eq(claimEvidenceLinks.relationship, link.relationship),
            ),
          )
          .limit(1);
        if (existing[0]) {
          ids.set(key, existing[0].id);
        }
      }
    }
    return ids;
  }

  async insertVerificationRun(input: {
    userId: string;
    outcome: ClaimVerificationOutcome;
    linkIds: Map<string, string>;
  }): Promise<string> {
    const runId = randomUUID();
    await this.db.insert(claimVerificationRuns).values({
      id: runId,
      userId: input.userId,
      claimId: input.outcome.claimId,
      status: input.outcome.status,
      sufficiencyStatus: input.outcome.sufficiencyStatus,
      sourceCount: input.outcome.sourceCount,
      independentSourceCount: input.outcome.independentSourceCount,
      supportingSourceCount: input.outcome.supportingSourceCount,
      contradictingSourceCount: input.outcome.contradictingSourceCount,
      assessmentSummary: input.outcome.assessmentSummary,
      metadata: {
        conflicts: input.outcome.conflicts,
      },
      completedAt: new Date(),
    });

    for (const link of input.outcome.links) {
      const key = `${link.claimId}:${link.sourceId}:${link.relationship}`;
      const evidenceLinkId = input.linkIds.get(key) ?? null;
      await this.db.insert(claimVerificationResults).values({
        id: randomUUID(),
        verificationRunId: runId,
        evidenceLinkId,
        result: link.relationship,
        assessmentReason: link.reasoningSummary,
      });
    }

    return runId;
  }

  async getSourceWithAssessment(input: {
    userId: string;
    sourceId: string;
  }) {
    const sourceRows = await this.db
      .select({
        source: researchSources,
        snapshotUserId: researchSnapshots.userId,
        snapshotId: researchSnapshots.id,
        capturedAt: researchSnapshots.capturedAt,
      })
      .from(researchSources)
      .innerJoin(
        researchSnapshots,
        eq(researchSources.snapshotId, researchSnapshots.id),
      )
      .where(
        and(
          eq(researchSources.id, input.sourceId),
          eq(researchSnapshots.userId, input.userId),
        ),
      )
      .limit(1);

    if (!sourceRows[0]) {
      return null;
    }

    const assessments = await this.db
      .select()
      .from(sourceAssessments)
      .where(
        and(
          eq(sourceAssessments.userId, input.userId),
          eq(sourceAssessments.sourceId, input.sourceId),
        ),
      )
      .orderBy(desc(sourceAssessments.assessedAt))
      .limit(5);

    const relationships = await this.db
      .select()
      .from(sourceRelationships)
      .where(
        and(
          eq(sourceRelationships.userId, input.userId),
          eq(sourceRelationships.sourceId, input.sourceId),
        ),
      )
      .limit(50);

    return {
      source: sourceRows[0].source,
      snapshotId: sourceRows[0].snapshotId,
      capturedAt: sourceRows[0].capturedAt,
      assessments,
      relationships,
    };
  }

  async getClaimVerification(input: {
    userId: string;
    claimId: string;
  }) {
    const claimRows = await this.db
      .select()
      .from(researchClaims)
      .where(
        and(
          eq(researchClaims.id, input.claimId),
          eq(researchClaims.userId, input.userId),
        ),
      )
      .limit(1);
    if (!claimRows[0]) {
      return null;
    }

    const links = await this.db
      .select()
      .from(claimEvidenceLinks)
      .where(
        and(
          eq(claimEvidenceLinks.userId, input.userId),
          eq(claimEvidenceLinks.claimId, input.claimId),
        ),
      )
      .limit(100);

    const runs = await this.db
      .select()
      .from(claimVerificationRuns)
      .where(
        and(
          eq(claimVerificationRuns.userId, input.userId),
          eq(claimVerificationRuns.claimId, input.claimId),
        ),
      )
      .orderBy(desc(claimVerificationRuns.createdAt))
      .limit(20);

    return { claim: claimRows[0], links, runs };
  }

  async getVerificationById(input: {
    userId: string;
    verificationId: string;
  }) {
    const runs = await this.db
      .select()
      .from(claimVerificationRuns)
      .where(
        and(
          eq(claimVerificationRuns.id, input.verificationId),
          eq(claimVerificationRuns.userId, input.userId),
        ),
      )
      .limit(1);
    if (!runs[0]) {
      return null;
    }

    const results = await this.db
      .select()
      .from(claimVerificationResults)
      .where(
        eq(claimVerificationResults.verificationRunId, input.verificationId),
      )
      .limit(100);

    return { run: runs[0], results };
  }

  async buildSnapshotReport(input: {
    userId: string;
    snapshotId: string;
  }): Promise<SnapshotEvidenceReport | null> {
    const snapshot = await this.db
      .select()
      .from(researchSnapshots)
      .where(
        and(
          eq(researchSnapshots.id, input.snapshotId),
          eq(researchSnapshots.userId, input.userId),
        ),
      )
      .limit(1);
    if (!snapshot[0]) {
      return null;
    }

    const sources = await this.db
      .select()
      .from(researchSources)
      .where(eq(researchSources.snapshotId, input.snapshotId));

    const sourceIds = sources.map((s) => s.id);
    const assessments =
      sourceIds.length === 0
        ? []
        : await this.db
            .select()
            .from(sourceAssessments)
            .where(eq(sourceAssessments.userId, input.userId))
            .limit(500);

    const relevantAssessments = assessments.filter((a) =>
      sourceIds.includes(a.sourceId),
    );

    const claims = await this.db
      .select()
      .from(researchClaims)
      .where(
        and(
          eq(researchClaims.userId, input.userId),
          eq(researchClaims.snapshotId, input.snapshotId),
        ),
      );

    const claimIds = claims.map((c) => c.id);
    const runs =
      claimIds.length === 0
        ? []
        : await this.db
            .select()
            .from(claimVerificationRuns)
            .where(eq(claimVerificationRuns.userId, input.userId))
            .orderBy(desc(claimVerificationRuns.createdAt))
            .limit(500);

    const latestByClaim = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!claimIds.includes(run.claimId)) {
        continue;
      }
      if (!latestByClaim.has(run.claimId)) {
        latestByClaim.set(run.claimId, run);
      }
    }

    const latestRuns = [...latestByClaim.values()];
    const contradictions = latestRuns.flatMap((run) => {
      const meta = run.metadata as { conflicts?: SnapshotEvidenceReport["contradictions"] } | null;
      return meta?.conflicts ?? [];
    });

    const evidenceGaps = latestRuns
      .filter(
        (r) =>
          r.status === "insufficient_evidence" ||
          r.sufficiencyStatus === "insufficient",
      )
      .map((r) => `claim ${r.claimId}: ${r.assessmentSummary.slice(0, 160)}`);

    return {
      snapshotId: input.snapshotId,
      researchSummary: `Snapshot "${snapshot[0].title}" — ${sources.length} sources, ${claims.length} claims.`,
      sourceQualityOverview: {
        assessed: relevantAssessments.length,
        firstParty: relevantAssessments.filter(
          (a) => a.publisherRelationship === "first_party",
        ).length,
        stale: relevantAssessments.filter((a) => a.freshnessCategory === "stale")
          .length,
        unknownDates: relevantAssessments.filter(
          (a) => a.freshnessCategory === "unknown",
        ).length,
        suspicious: relevantAssessments.filter((a) => a.suspiciousContent)
          .length,
      },
      claimVerificationSummary: {
        total: latestRuns.length,
        supported: latestRuns.filter((r) => r.status === "supported").length,
        partiallySupported: latestRuns.filter(
          (r) => r.status === "partially_supported",
        ).length,
        contradicted: latestRuns.filter((r) => r.status === "contradicted")
          .length,
        insufficient: latestRuns.filter(
          (r) => r.status === "insufficient_evidence",
        ).length,
        conflicting: latestRuns.filter(
          (r) => r.status === "conflicting_evidence",
        ).length,
        outdated: latestRuns.filter((r) => r.status === "outdated_evidence")
          .length,
      },
      contradictions,
      evidenceGaps,
      citationReferences: sources.map((s) => `[ref:web_${s.id.slice(0, 8)}]`),
    };
  }
}
