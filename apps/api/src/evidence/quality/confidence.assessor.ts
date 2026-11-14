import type { SufficiencyStatus, VerificationStatus } from "../evidence.types.js";

/**
 * Heuristic confidence label — never treat as a calibrated probability
 * and never use an LLM-generated score as the sole verification decision.
 */
export function assessVerificationConfidence(input: {
  status: VerificationStatus;
  sufficiencyStatus: SufficiencyStatus;
  independentSourceCount: number;
  bestAuthorityScore: number;
  hasFirstPartySupport: boolean;
}): {
  label: "high" | "medium" | "low" | "none";
  heuristicScore: number;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (
    input.status === "insufficient_evidence" ||
    input.status === "not_verifiable"
  ) {
    return {
      label: "none",
      heuristicScore: 0,
      reasons: ["no_adequate_evidence"],
    };
  }

  if (
    input.status === "contradicted" ||
    input.status === "conflicting_evidence"
  ) {
    return {
      label: "low",
      heuristicScore: 0.25,
      reasons: ["conflict_or_contradiction"],
    };
  }

  let score = 0.35;
  if (input.hasFirstPartySupport) {
    score += 0.25;
    reasons.push("first_party_support");
  }
  score += Math.min(0.25, input.bestAuthorityScore * 0.25);
  score += Math.min(0.2, input.independentSourceCount * 0.1);
  if (input.sufficiencyStatus === "sufficient") {
    score += 0.1;
    reasons.push("sufficiency_sufficient");
  } else if (input.sufficiencyStatus === "partially_sufficient") {
    reasons.push("sufficiency_partial");
  }

  score = Math.max(0, Math.min(1, score));
  const label =
    score >= 0.75 ? "high" : score >= 0.5 ? "medium" : score > 0 ? "low" : "none";

  return { label, heuristicScore: score, reasons };
}
