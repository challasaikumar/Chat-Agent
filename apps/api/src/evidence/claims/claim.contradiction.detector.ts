import type { DetectedConflict } from "../evidence.types.js";

export type ContradictionClaim = {
  id: string;
  statement: string;
  entityName?: string | null;
  attribute?: string | null;
  value?: string | null;
  planName?: string | null;
  region?: string | null;
  currency?: string | null;
  unit?: string | null;
  observationDate?: string | Date | null;
  sourceId?: string | null;
};

/**
 * Distinguish genuine contradictions from scope differences
 * (region, plan, billing period, version, effective date).
 */
export function detectClaimConflicts(
  claims: ContradictionClaim[],
): DetectedConflict[] {
  const conflicts: DetectedConflict[] = [];

  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const a = claims[i]!;
      const b = claims[j]!;
      const conflict = comparePair(a, b);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

function comparePair(
  a: ContradictionClaim,
  b: ContradictionClaim,
): DetectedConflict | null {
  const sameEntity =
    normalize(a.entityName) &&
    normalize(a.entityName) === normalize(b.entityName);
  const sameAttribute =
    normalize(a.attribute) &&
    normalize(a.attribute) === normalize(b.attribute);

  if (!sameEntity || !sameAttribute) {
    return null;
  }

  const valueA = normalizeValue(a.value ?? a.statement);
  const valueB = normalizeValue(b.value ?? b.statement);
  if (!valueA || !valueB || valueA === valueB) {
    return null;
  }

  // Scope differences — not necessarily contradictions.
  if (normalize(a.planName) && normalize(b.planName) && normalize(a.planName) !== normalize(b.planName)) {
    return {
      conflictType: "plan_conflict",
      claimIds: [a.id, b.id],
      sourceIds: [a.sourceId, b.sourceId].filter(Boolean) as string[],
      summary: `Different plan scopes (${a.planName} vs ${b.planName}); values ${valueA} vs ${valueB}.`,
      resolvableByScope: true,
      scopeHint: "plan",
    };
  }

  if (normalize(a.region) && normalize(b.region) && normalize(a.region) !== normalize(b.region)) {
    return {
      conflictType: "geographic_scope_conflict",
      claimIds: [a.id, b.id],
      sourceIds: [a.sourceId, b.sourceId].filter(Boolean) as string[],
      summary: `Different regions (${a.region} vs ${b.region}); values ${valueA} vs ${valueB}.`,
      resolvableByScope: true,
      scopeHint: "region",
    };
  }

  if (normalize(a.unit) && normalize(b.unit) && normalize(a.unit) !== normalize(b.unit)) {
    return {
      conflictType: "value_conflict",
      claimIds: [a.id, b.id],
      sourceIds: [a.sourceId, b.sourceId].filter(Boolean) as string[],
      summary: `Different units (${a.unit} vs ${b.unit}); not directly comparable.`,
      resolvableByScope: true,
      scopeHint: "unit",
    };
  }

  const dateA = toTime(a.observationDate);
  const dateB = toTime(b.observationDate);
  if (dateA && dateB && Math.abs(dateA - dateB) >= 86_400_000 * 7) {
    return {
      conflictType: "temporal_conflict",
      claimIds: [a.id, b.id],
      sourceIds: [a.sourceId, b.sourceId].filter(Boolean) as string[],
      summary: `Values differ across observation dates (${valueA} vs ${valueB}); may reflect change over time.`,
      resolvableByScope: true,
      scopeHint: "time",
    };
  }

  return {
    conflictType: "value_conflict",
    claimIds: [a.id, b.id],
    sourceIds: [a.sourceId, b.sourceId].filter(Boolean) as string[],
    summary: `Conflicting values for ${a.entityName}.${a.attribute}: ${valueA} vs ${valueB}.`,
    resolvableByScope: false,
    scopeHint: null,
  };
}

function normalize(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase();
}

function normalizeValue(value: string): string | null {
  const price = value.match(/\$?\s*([\d,.]+)/);
  if (price) {
    return price[1]!.replace(/,/g, "");
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

function toTime(value?: string | Date | null): number | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}
