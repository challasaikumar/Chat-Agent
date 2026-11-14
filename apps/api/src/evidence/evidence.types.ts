export type SourceType =
  | "official_documentation"
  | "official_pricing"
  | "official_changelog"
  | "official_announcement"
  | "government_or_regulatory"
  | "academic_research"
  | "established_news"
  | "specialist_publication"
  | "independent_analysis"
  | "community_discussion"
  | "user_generated_content"
  | "unknown";

export type PublisherRelationship =
  | "first_party"
  | "official_partner"
  | "independent"
  | "community"
  | "unknown";

export type FreshnessCategory =
  | "current"
  | "recent"
  | "aging"
  | "stale"
  | "unknown";

export type SourceDateType =
  | "published_at"
  | "updated_at"
  | "effective_at"
  | "retrieved_at"
  | "snapshot_captured_at";

export type SourceRelationshipType =
  | "duplicate"
  | "syndicated"
  | "cites"
  | "derives_from"
  | "independent"
  | "related"
  | "unknown";

export type EvidenceRelationship =
  | "supports"
  | "partially_supports"
  | "contradicts"
  | "contextualizes"
  | "mentions"
  | "insufficient";

export type EvidenceDirectness = "direct" | "indirect" | "ambiguous";

export type VerificationStatus =
  | "supported"
  | "partially_supported"
  | "contradicted"
  | "insufficient_evidence"
  | "outdated_evidence"
  | "conflicting_evidence"
  | "not_verifiable";

export type SufficiencyStatus =
  | "sufficient"
  | "partially_sufficient"
  | "insufficient"
  | "conflicting";

export type ConflictType =
  | "value_conflict"
  | "date_conflict"
  | "entity_conflict"
  | "plan_conflict"
  | "version_conflict"
  | "geographic_scope_conflict"
  | "temporal_conflict"
  | "source_attribution_conflict";

export type AssessmentStatus =
  | "assessed"
  | "partially_assessed"
  | "unknown";

/** Heuristic 0–1 suitability scores — not calibrated probabilities. */
export type SourceAssessmentResult = {
  sourceId: string;
  sourceType: SourceType;
  publisherRelationship: PublisherRelationship;
  domain: string;
  authorityScore: number;
  relevanceScore: number;
  transparencyScore: number;
  freshnessScore: number;
  directnessScore: number;
  overallSuitabilityScore: number;
  freshnessCategory: FreshnessCategory;
  assessmentStatus: AssessmentStatus;
  reasons: string[];
  suspiciousContent: boolean;
  assessedAt: string;
};

export type FreshnessAssessment = {
  freshnessCategory: FreshnessCategory;
  ageInDays: number | null;
  relevantReferenceTimestamp: string | null;
  sourceDateType: SourceDateType;
  reasons: string[];
  freshnessScore: number;
};

export type ClaimEvidenceLinkResult = {
  claimId: string;
  sourceId: string;
  relationship: EvidenceRelationship;
  evidenceExcerpt: string;
  directness: EvidenceDirectness;
  confidence: number;
  reasoningSummary: string;
};

export type SourcePairRelationship = {
  sourceId: string;
  relatedSourceId: string;
  relationshipType: SourceRelationshipType;
  confidence: number;
  evidence: string;
};

export type DetectedConflict = {
  conflictType: ConflictType;
  claimIds: string[];
  sourceIds: string[];
  summary: string;
  resolvableByScope: boolean;
  scopeHint: string | null;
};

export type ClaimVerificationOutcome = {
  claimId: string;
  status: VerificationStatus;
  sufficiencyStatus: SufficiencyStatus;
  sourceCount: number;
  independentSourceCount: number;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  assessmentSummary: string;
  links: ClaimEvidenceLinkResult[];
  conflicts: DetectedConflict[];
  assessments: SourceAssessmentResult[];
};

export type SnapshotEvidenceReport = {
  snapshotId: string;
  researchSummary: string;
  sourceQualityOverview: {
    assessed: number;
    firstParty: number;
    stale: number;
    unknownDates: number;
    suspicious: number;
  };
  claimVerificationSummary: {
    total: number;
    supported: number;
    partiallySupported: number;
    contradicted: number;
    insufficient: number;
    conflicting: number;
    outdated: number;
  };
  contradictions: DetectedConflict[];
  evidenceGaps: string[];
  citationReferences: string[];
};
