import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";

export type EvidenceObservation = {
  verificationStatuses: string[];
  freshnessCategories: string[];
  independentSourceCount?: number;
};

export function gradeEvidence(
  expected: ExpectedSpec,
  observed: EvidenceObservation,
): GradeAssertion[] {
  const assertions: GradeAssertion[] = [];

  for (const status of expected.verificationStatuses ?? []) {
    assertions.push({
      id: `evidence.status.${status}`,
      description: `Verification status includes ${status}`,
      passed: observed.verificationStatuses.includes(status),
      expected: status,
      actual: observed.verificationStatuses,
      explanation: observed.verificationStatuses.includes(status)
        ? "Status present"
        : "Expected verification status missing",
      failureCategory: "EVIDENCE_VERIFICATION_FAILURE",
      critical: true,
    });
  }

  for (const freshness of expected.freshnessCategories ?? []) {
    assertions.push({
      id: `evidence.freshness.${freshness}`,
      description: `Freshness category includes ${freshness}`,
      passed: observed.freshnessCategories.includes(freshness),
      expected: freshness,
      actual: observed.freshnessCategories,
      explanation: observed.freshnessCategories.includes(freshness)
        ? "Freshness present"
        : "Expected freshness category missing",
      failureCategory: "EVIDENCE_VERIFICATION_FAILURE",
      critical: false,
    });
  }

  if (expected.independentSourceMax != null && observed.independentSourceCount != null) {
    assertions.push({
      id: "evidence.independence",
      description: "Independent source count within max",
      passed: observed.independentSourceCount <= expected.independentSourceMax,
      expected: `<=${expected.independentSourceMax}`,
      actual: observed.independentSourceCount,
      explanation: "Duplicate/syndicated sources should not inflate independence",
      failureCategory: "EVIDENCE_VERIFICATION_FAILURE",
      critical: true,
    });
  }

  return assertions;
}
