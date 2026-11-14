import { normalizeCanonicalName } from "../../utils/normalize.js";
import type { Entity } from "../../db/schema.js";

export type EntityMatch = {
  inputName: string;
  entityId: string | null;
  canonicalName: string;
  confidence: number;
  reason: string;
};

const ALIAS_MAP: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  "amazon rds": "amazon rds",
  "aws rds": "amazon rds",
  hubspot: "hubspot",
  "hubspot crm": "hubspot",
  supabase: "supabase",
  "supabase inc": "supabase",
  "supabase inc.": "supabase",
  zoho: "zoho crm",
  "zoho crm": "zoho crm",
};

export function normalizeEntityKey(name: string): string {
  const canonical = normalizeCanonicalName(name);
  return ALIAS_MAP[canonical] ?? canonical;
}

export function matchEntityName(
  inputName: string,
  known: Entity[],
): EntityMatch {
  const key = normalizeEntityKey(inputName);

  for (const entity of known) {
    const candidates = [
      entity.canonicalName,
      entity.displayName,
      ...(entity.aliases ?? []),
    ].map((value) => normalizeEntityKey(value));

    if (candidates.includes(key)) {
      return {
        inputName,
        entityId: entity.id,
        canonicalName: entity.displayName,
        confidence: 0.95,
        reason: "exact_alias_or_canonical_match",
      };
    }
  }

  // Fuzzy containment only for longer names to avoid false merges
  if (key.length >= 4) {
    for (const entity of known) {
      const canonical = normalizeEntityKey(entity.canonicalName);
      if (canonical.includes(key) || key.includes(canonical)) {
        if (Math.abs(canonical.length - key.length) <= 4) {
          return {
            inputName,
            entityId: entity.id,
            canonicalName: entity.displayName,
            confidence: 0.7,
            reason: "near_canonical_containment",
          };
        }
      }
    }
  }

  return {
    inputName,
    entityId: null,
    canonicalName: inputName.trim(),
    confidence: 0.4,
    reason: "unmatched_passthrough",
  };
}

export class EntityResolver {
  resolveMany(names: string[], known: Entity[]): EntityMatch[] {
    const seen = new Set<string>();
    const results: EntityMatch[] = [];
    for (const name of names) {
      const match = matchEntityName(name, known);
      const dedupe = normalizeEntityKey(match.canonicalName);
      if (seen.has(dedupe)) {
        continue;
      }
      seen.add(dedupe);
      results.push(match);
    }
    return results;
  }
}
