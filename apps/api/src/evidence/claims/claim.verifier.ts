import type { ClaimCategory } from "../../db/schema.js";
import { CorroborationService } from "../corroboration/corroboration.service.js";
import { ConflictDetector } from "../conflicts/conflict.detector.js";
import { ConflictResolver } from "../conflicts/conflict.resolver.js";
import type {
  ClaimVerificationOutcome,
  SourceAssessmentResult,
  SourcePairRelationship,
  VerificationStatus,
} from "../evidence.types.js";
import { assessEvidenceSufficiency } from "../quality/evidence.sufficiency.js";
import { SourceAssessor } from "../sources/source.assessor.js";
import { analyzeSourceIndependence } from "../sources/source.independence.js";
import { ClaimEvidenceMapper } from "./claim.evidence.mapper.js";

export type VerifiableClaim = {
  id: string;
  statement: string;
  entityName: string;
  category: ClaimCategory;
  attribute: string;
  value: string;
  planName?: string | null;
  region?: string | null;
  unit?: string | null;
  sourceId: string;
  evidenceExcerpt: string;
  observationDate?: Date | string | null;
  publishedAt?: Date | string | null;
  effectiveAt?: Date | string | null;
};

export type VerifiableSource = {
  id: string;
  userId: string;
  url: string;
  title: string;
  content: string;
  contentHash?: string | null;
  publishedAt?: Date | string | null;
  retrievedAt?: Date | string | null;
  snapshotCapturedAt?: Date | string | null;
};

export class ClaimVerifier {
  constructor(
    private readonly sourceAssessor = new SourceAssessor(),
    private readonly mapper = new ClaimEvidenceMapper(),
    private readonly corroboration = new CorroborationService(),
    private readonly conflicts = new ConflictDetector(),
    private readonly conflictResolver = new ConflictResolver(),
  ) {}

  verifyClaim(input: {
    claim: VerifiableClaim;
    sources: VerifiableSource[];
    userId: string;
    relatedClaims?: VerifiableClaim[];
    maxSourcesPerClaim?: number;
    minCorroborationSources?: number;
    now?: Date;
  }): ClaimVerificationOutcome {
    const maxSources = input.maxSourcesPerClaim ?? 10;
    const minCorroboration = input.minCorroborationSources ?? 2;

    const assessments: SourceAssessmentResult[] = input.sources
      .slice(0, maxSources)
      .map((source) =>
        this.sourceAssessor.assess({
          sourceId: source.id,
          url: source.url,
          title: source.title,
          content: source.content,
          publishedAt: source.publishedAt,
          retrievedAt: source.retrievedAt,
          snapshotCapturedAt: source.snapshotCapturedAt,
          claimCategory: input.claim.category,
          entityName: input.claim.entityName,
          now: input.now,
        }),
      );

    const independence = analyzeSourceIndependence(
      input.sources.map((s) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        content: s.content,
        contentHash: s.contentHash,
      })),
    );

    const links = this.mapper.mapClaimToSources({
      claim: {
        id: input.claim.id,
        statement: input.claim.statement,
        value: input.claim.value,
        attribute: input.claim.attribute,
        sourceId: input.claim.sourceId,
        evidenceExcerpt: input.claim.evidenceExcerpt,
      },
      sources: input.sources.map((s) => ({
        id: s.id,
        url: s.url,
        content: s.content,
        title: s.title,
        userId: s.userId,
      })),
      userId: input.userId,
      maxSources,
    });

    const corroboration = this.corroboration.evaluate({
      claimId: input.claim.id,
      claimCategory: input.claim.category,
      links,
      assessments,
      relationships: independence.relationships,
      minCorroborationSources: minCorroboration,
    });

    const related = [input.claim, ...(input.relatedClaims ?? [])];
    const detectedConflicts = this.conflicts.detect(
      related.map((c) => ({
        id: c.id,
        statement: c.statement,
        entityName: c.entityName,
        attribute: c.attribute,
        value: c.value,
        planName: c.planName,
        region: c.region,
        unit: c.unit,
        observationDate: c.observationDate,
        sourceId: c.sourceId,
      })),
    );

    const resolutions = this.conflictResolver.resolve({
      conflicts: detectedConflicts,
      assessmentsBySourceId: new Map(
        assessments.map((a) => [a.sourceId, a]),
      ),
    });
    const unresolved = resolutions.filter(
      (r) => r.disposition === "disclosed_unresolved",
    );

    const sufficiency = assessEvidenceSufficiency({
      claimCategory: input.claim.category,
      corroboration,
      assessments,
      minCorroborationSources: minCorroboration,
      hasUnresolvedConflict: unresolved.length > 0,
    });

    const status = deriveVerificationStatus({
      corroborationAgreement: corroboration.agreement,
      sufficiencyStatus: sufficiency.status,
      assessments,
      supportingCount: corroboration.supportingSourceIds.length,
      contradictingCount: corroboration.contradictingSourceIds.length,
      hasUnresolvedConflict: unresolved.length > 0,
    });

    const assessmentSummary = [
      `status=${status}`,
      `sufficiency=${sufficiency.status}`,
      corroboration.summary,
      ...sufficiency.reasons.slice(0, 4),
      unresolved.length > 0
        ? `unresolved_conflicts=${unresolved.length}`
        : "no_unresolved_conflicts",
    ].join(" | ");

    return {
      claimId: input.claim.id,
      status,
      sufficiencyStatus: sufficiency.status,
      sourceCount: input.sources.length,
      independentSourceCount: independence.independentSourceCount,
      supportingSourceCount: corroboration.supportingSourceIds.length,
      contradictingSourceCount: corroboration.contradictingSourceIds.length,
      assessmentSummary,
      links,
      conflicts: detectedConflicts,
      assessments,
    };
  }

  analyzeIndependence(sources: VerifiableSource[]): {
    relationships: SourcePairRelationship[];
    independentSourceCount: number;
  } {
    const analysis = analyzeSourceIndependence(
      sources.map((s) => ({
        id: s.id,
        url: s.url,
        title: s.title,
        content: s.content,
        contentHash: s.contentHash,
      })),
    );
    return {
      relationships: analysis.relationships,
      independentSourceCount: analysis.independentSourceCount,
    };
  }
}

function deriveVerificationStatus(input: {
  corroborationAgreement: "agree" | "partial" | "conflict" | "none";
  sufficiencyStatus: ClaimVerificationOutcome["sufficiencyStatus"];
  assessments: SourceAssessmentResult[];
  supportingCount: number;
  contradictingCount: number;
  hasUnresolvedConflict: boolean;
}): VerificationStatus {
  if (input.hasUnresolvedConflict || input.corroborationAgreement === "conflict") {
    return "conflicting_evidence";
  }
  if (input.contradictingCount > 0 && input.supportingCount === 0) {
    return "contradicted";
  }
  if (input.supportingCount === 0) {
    return "insufficient_evidence";
  }

  const supportingFresh = input.assessments.filter((a) =>
    ["current", "recent"].includes(a.freshnessCategory),
  );
  const allStale =
    input.assessments.length > 0 &&
    input.assessments.every(
      (a) =>
        a.freshnessCategory === "stale" || a.freshnessCategory === "unknown",
    );
  if (allStale && supportingFresh.length === 0) {
    return "outdated_evidence";
  }

  if (input.sufficiencyStatus === "sufficient" && input.corroborationAgreement === "agree") {
    return "supported";
  }
  if (
    input.sufficiencyStatus === "partially_sufficient" ||
    input.corroborationAgreement === "partial"
  ) {
    return "partially_supported";
  }
  if (input.sufficiencyStatus === "insufficient") {
    return "insufficient_evidence";
  }
  if (input.sufficiencyStatus === "conflicting") {
    return "conflicting_evidence";
  }
  return "not_verifiable";
}
