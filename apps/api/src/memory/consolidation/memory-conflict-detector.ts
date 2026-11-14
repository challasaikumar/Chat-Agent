import type { MemoryFact } from "../../db/schema.js";

export type MemoryConflict = {
  subjectKey: string;
  facts: MemoryFact[];
  reason: string;
  resolvable: boolean;
};

/**
 * Detects conflicting active memories that share a memory key / entity
 * but disagree on normalized value or assertion.
 */
export function detectConflicts(facts: MemoryFact[]): MemoryConflict[] {
  const byKey = new Map<string, MemoryFact[]>();
  for (const fact of facts) {
    if (!fact.isActive || fact.assertionStatus === "retracted") {
      continue;
    }
    const key = `${fact.entityId ?? "none"}|${fact.memoryKey ?? fact.category}`;
    const list = byKey.get(key) ?? [];
    list.push(fact);
    byKey.set(key, list);
  }

  const conflicts: MemoryConflict[] = [];
  for (const [subjectKey, group] of byKey) {
    if (group.length < 2) {
      continue;
    }
    const values = new Set(
      group.map((f) => (f.normalizedValue ?? f.fact).toLowerCase()),
    );
    const statuses = new Set(group.map((f) => f.assertionStatus));
    if (values.size <= 1) {
      continue;
    }

    const hasConfirmed = [...statuses].some((s) =>
      ["confirmed", "implemented"].includes(s),
    );
    const hasConsidered = statuses.has("considered") || statuses.has("proposed");

    conflicts.push({
      subjectKey,
      facts: group,
      reason:
        hasConfirmed && hasConsidered
          ? "confirmed_and_consideration_coexist"
          : "conflicting_normalized_values",
      resolvable: hasConfirmed && hasConsidered,
    });
  }
  return conflicts;
}
