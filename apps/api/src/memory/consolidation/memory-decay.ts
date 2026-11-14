import type { MemoryFact } from "../../db/schema.js";

/**
 * Ranking adjustment only — never deletes useful facts.
 */
export function decayFactor(
  fact: MemoryFact,
  now = new Date(),
  enabled = true,
): number {
  if (!enabled) {
    return 1;
  }
  if (
    fact.category === "preference" ||
    fact.assertionStatus === "confirmed" ||
    fact.assertionStatus === "implemented"
  ) {
    return 1;
  }
  const anchor = fact.lastAccessedAt ?? fact.lastConfirmedAt ?? fact.createdAt;
  const ageDays = (now.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays <= 30) {
    return 1;
  }
  if (ageDays >= 365) {
    return 0.7;
  }
  return 1 - (ageDays - 30) * (0.3 / 335);
}
