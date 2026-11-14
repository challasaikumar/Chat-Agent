import type { ResearchClaim } from "../../db/schema.js";
import { normalizeEntityKey } from "../entities/entity-matcher.js";
import { compareDecimal } from "./comparison.numeric.js";

export function findConflictingPricingClaims(
  claims: ResearchClaim[],
): ResearchClaim[][] {
  const groups = new Map<string, ResearchClaim[]>();
  for (const claim of claims) {
    if (claim.category !== "pricing" || !claim.numericValue) {
      continue;
    }
    const key = [
      normalizeEntityKey(claim.entityName),
      claim.planName ?? "",
      claim.billingPeriod ?? "",
      claim.unit ?? "",
      claim.currency ?? "",
    ].join("|");
    const list = groups.get(key) ?? [];
    list.push(claim);
    groups.set(key, list);
  }

  const conflicts: ResearchClaim[][] = [];
  for (const list of groups.values()) {
    if (list.length < 2) {
      continue;
    }
    const amounts = new Set(list.map((c) => c.numericValue));
    if (amounts.size > 1) {
      conflicts.push(list);
    }
  }
  return conflicts;
}

export function claimsConflict(
  a: ResearchClaim,
  b: ResearchClaim,
): boolean {
  if (a.category !== b.category) {
    return false;
  }
  if (a.category === "pricing" && a.numericValue && b.numericValue) {
    return compareDecimal(a.numericValue, b.numericValue) !== 0;
  }
  return a.originalValue.trim() !== b.originalValue.trim();
}
