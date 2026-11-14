import type { MemoryFact } from "../../db/schema.js";
import { normalizeFactKey } from "../../utils/normalize.js";

export function isNearDuplicate(a: MemoryFact, b: MemoryFact): boolean {
  if (a.id === b.id) {
    return true;
  }
  if (a.memoryKey && b.memoryKey && a.memoryKey === b.memoryKey) {
    if ((a.entityId ?? null) === (b.entityId ?? null)) {
      return normalizeFactKey(a.fact) === normalizeFactKey(b.fact);
    }
  }
  return normalizeFactKey(a.fact) === normalizeFactKey(b.fact);
}

export function findDuplicateGroups(facts: MemoryFact[]): MemoryFact[][] {
  const groups: MemoryFact[][] = [];
  const used = new Set<string>();
  for (const fact of facts) {
    if (used.has(fact.id)) {
      continue;
    }
    const group = facts.filter((other) => isNearDuplicate(fact, other));
    if (group.length > 1) {
      for (const item of group) {
        used.add(item.id);
      }
      groups.push(group);
    }
  }
  return groups;
}
