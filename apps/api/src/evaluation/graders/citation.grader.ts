import type { ExpectedSpec } from "../evaluation.schemas.js";
import type { GradeAssertion } from "../evaluation.types.js";
import {
  citationPrecision,
  citationRecall,
  citationValidityRate,
  type CitationAssessment,
} from "../metrics/citation.metrics.js";

const CITATION_RE = /\[ref:([^\]]+)\]/gi;

export function extractCitationIds(answer: string): string[] {
  const ids: string[] = [];
  for (const match of answer.matchAll(CITATION_RE)) {
    if (match[1]) ids.push(match[1]);
  }
  return ids;
}

export function gradeCitations(
  expected: ExpectedSpec,
  answer: string,
  validEvidenceIds: Set<string>,
): { assertions: GradeAssertion[]; metrics: Record<string, number | null> } {
  const citations = extractCitationIds(answer);
  const valid = citations.filter((id) => validEvidenceIds.has(id));
  const invalid = citations.filter((id) => !validEvidenceIds.has(id));

  const assessment: CitationAssessment = {
    totalCitations: citations.length,
    validCitations: valid.length,
    relevantCitations: valid.length,
    materialClaims: expected.citationsRequired ? Math.max(1, citations.length) : 0,
    citedMaterialClaims: valid.length,
    unsupportedMaterialClaims: expected.citationsRequired && valid.length === 0 ? 1 : 0,
  };

  const assertions: GradeAssertion[] = [];

  if (expected.citationsRequired) {
    assertions.push({
      id: "citation.required",
      description: "Answer includes at least one valid citation",
      passed: valid.length > 0,
      expected: ">=1 valid citation",
      actual: { citations, valid },
      explanation:
        valid.length > 0
          ? "Valid citations present"
          : "Missing valid citations for material claims",
      failureCategory: "CITATION_FAILURE",
      critical: true,
    });
  }

  if (invalid.length > 0) {
    assertions.push({
      id: "citation.invalid",
      description: "No fabricated citation IDs",
      passed: false,
      expected: [...validEvidenceIds],
      actual: invalid,
      explanation: `Invalid citation IDs: ${invalid.join(", ")}`,
      failureCategory: "CITATION_FAILURE",
      critical: true,
    });
  } else if (citations.length > 0) {
    assertions.push({
      id: "citation.valid",
      description: "All citation IDs resolve to owned evidence",
      passed: true,
      expected: "all valid",
      actual: citations,
      explanation: "Citation IDs validated against evidence registry",
      critical: true,
    });
  }

  for (const bad of expected.invalidCitationIds ?? []) {
    assertions.push({
      id: `citation.reject.${bad}`,
      description: `Invalid citation ${bad} must be rejected`,
      passed: !citations.includes(bad) || !validEvidenceIds.has(bad),
      expected: "rejected",
      actual: citations.includes(bad) ? "present" : "absent",
      explanation: "Invalid IDs must not count as valid evidence",
      failureCategory: "CITATION_FAILURE",
      critical: true,
    });
  }

  return {
    assertions,
    metrics: {
      citationPrecision: citationPrecision(assessment),
      citationRecall: citationRecall(assessment),
      citationValidityRate: citationValidityRate(assessment),
    },
  };
}
