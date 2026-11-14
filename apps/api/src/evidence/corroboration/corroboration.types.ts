import type {
  ClaimEvidenceLinkResult,
  SourceAssessmentResult,
  SourcePairRelationship,
} from "../evidence.types.js";

export type CorroborationInput = {
  claimId: string;
  claimCategory?: string | null;
  links: ClaimEvidenceLinkResult[];
  assessments: SourceAssessmentResult[];
  relationships: SourcePairRelationship[];
  minCorroborationSources: number;
};

export type CorroborationResult = {
  claimId: string;
  supportingSourceIds: string[];
  contradictingSourceIds: string[];
  independentSupportingCount: number;
  bestAuthorityScore: number;
  hasFirstPartySupport: boolean;
  agreement: "agree" | "partial" | "conflict" | "none";
  summary: string;
};
