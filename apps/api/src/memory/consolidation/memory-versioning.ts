import type { AssertionStatus, MemoryFact } from "../../db/schema.js";

const CONFIRMED: AssertionStatus[] = ["confirmed", "implemented"];
const WEAK: AssertionStatus[] = ["proposed", "considered", "uncertain"];

/**
 * Decide whether a candidate fact should supersede an existing active fact.
 * Considerations never silently overwrite confirmed decisions.
 */
export function shouldSupersede(
  existing: MemoryFact,
  candidate: {
    assertionStatus: AssertionStatus;
    confidence: number;
    fact: string;
  },
): "supersede" | "keep_both" | "duplicate" | "reject_candidate" {
  if (existing.fact.trim().toLowerCase() === candidate.fact.trim().toLowerCase()) {
    return "duplicate";
  }

  const existingConfirmed = CONFIRMED.includes(existing.assertionStatus);
  const candidateConfirmed = CONFIRMED.includes(candidate.assertionStatus);
  const candidateWeak = WEAK.includes(candidate.assertionStatus);

  if (existingConfirmed && candidateWeak) {
    return "keep_both";
  }

  if (existingConfirmed && candidateConfirmed) {
    return "supersede";
  }

  if (!existingConfirmed && candidateConfirmed) {
    return "supersede";
  }

  if (
    existing.assertionStatus === "considered" &&
    candidate.assertionStatus === "confirmed"
  ) {
    return "supersede";
  }

  if (candidate.confidence + 0.15 < existing.confidence) {
    return "reject_candidate";
  }

  return "keep_both";
}
