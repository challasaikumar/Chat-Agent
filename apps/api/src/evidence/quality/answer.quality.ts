import { findFabricatedUrls } from "../security/source-url.validator.js";
import type { VerificationStatus } from "../evidence.types.js";

export type AnswerQualityIssue = {
  code:
    | "fabricated_url"
    | "invalid_citation_ref"
    | "unsupported_numeric"
    | "missing_conflict_disclosure"
    | "missing_limitation_disclosure"
    | "outdated_unqualified";
  message: string;
  severity: "error" | "warning";
};

export type AnswerQualityResult = {
  ok: boolean;
  issues: AnswerQualityIssue[];
};

const CITATION_REF = /\[ref:([a-z]+_[a-z0-9]+)\]/gi;
const NUMERIC = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d+(?:\.\d+)?\s*%/g;

/**
 * Bounded validation of final structured responses.
 * Does not rewrite answers indefinitely.
 */
export function validateAnswerQuality(input: {
  answerText: string;
  validCitationKeys: Set<string>;
  persistedUrls: Iterable<string>;
  verificationStatuses: VerificationStatus[];
  disclosedConflicts?: boolean;
  disclosedLimitations?: boolean;
  supportedNumericValues?: Set<string>;
}): AnswerQualityResult {
  const issues: AnswerQualityIssue[] = [];

  for (const match of input.answerText.matchAll(CITATION_REF)) {
    const key = match[1]!;
    if (!input.validCitationKeys.has(key) && !input.validCitationKeys.has(`ref:${key}`) && ![...input.validCitationKeys].some((k) => k.endsWith(key) || k.includes(key))) {
      // Accept either raw key or full registry key forms.
      const found = [...input.validCitationKeys].some(
        (k) => k === key || k.endsWith(`_${key}`) || k.includes(key),
      );
      if (!found) {
        issues.push({
          code: "invalid_citation_ref",
          message: `Citation reference [ref:${key}] is not registered.`,
          severity: "error",
        });
      }
    }
  }

  for (const url of findFabricatedUrls(input.answerText, input.persistedUrls)) {
    issues.push({
      code: "fabricated_url",
      message: `URL not present in persisted sources: ${url}`,
      severity: "error",
    });
  }

  if (input.supportedNumericValues) {
    const nums = input.answerText.match(NUMERIC) ?? [];
    for (const raw of nums) {
      const normalized = raw.replace(/[$,%\s]/g, "");
      if (!input.supportedNumericValues.has(normalized)) {
        // Only flag currency-like values to reduce false positives.
        if (raw.includes("$")) {
          issues.push({
            code: "unsupported_numeric",
            message: `Numeric assertion ${raw} lacks supporting evidence.`,
            severity: "error",
          });
        }
      }
    }
  }

  const hasConflict = input.verificationStatuses.some(
    (s) => s === "conflicting_evidence" || s === "contradicted",
  );
  if (hasConflict && !input.disclosedConflicts) {
    const discloses =
      /conflict|disagree|contradict|differ|inconsistent/i.test(input.answerText);
    if (!discloses) {
      issues.push({
        code: "missing_conflict_disclosure",
        message: "Conflicting evidence exists but answer does not disclose it.",
        severity: "warning",
      });
    }
  }

  const hasInsufficient = input.verificationStatuses.some(
    (s) =>
      s === "insufficient_evidence" ||
      s === "not_verifiable" ||
      s === "outdated_evidence",
  );
  if (hasInsufficient && !input.disclosedLimitations) {
    const discloses =
      /insufficient|unable to verify|not enough evidence|unclear|unknown|outdated|may have changed/i.test(
        input.answerText,
      );
    if (!discloses) {
      issues.push({
        code: "missing_limitation_disclosure",
        message: "Evidence gaps exist but answer does not qualify limitations.",
        severity: "warning",
      });
    }
  }

  const hasOutdated = input.verificationStatuses.includes("outdated_evidence");
  if (hasOutdated) {
    const qualifies = /outdated|as of|previously|historical|may no longer/i.test(
      input.answerText,
    );
    if (!qualifies) {
      issues.push({
        code: "outdated_unqualified",
        message: "Outdated evidence used without temporal qualification.",
        severity: "warning",
      });
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
  };
}
