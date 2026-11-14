import type { AppDatabase } from "../../db/index.js";
import type { MemoryFact } from "../../db/schema.js";
import { FactRepository } from "../../repositories/fact.repository.js";

export class DecisionService {
  private readonly facts: FactRepository;

  constructor(db: AppDatabase) {
    this.facts = new FactRepository(db);
  }

  async list(userId: string, options: { entityId?: string; includeHistory?: boolean } = {}) {
    return this.facts.listForUser(userId, {
      limit: 200,
      category: "decision",
      entityId: options.entityId,
      activeOnly: !options.includeHistory,
    });
  }

  async history(userId: string, factId: string): Promise<MemoryFact[]> {
    return this.facts.listHistory(userId, factId);
  }

  async currentAndOriginal(
    userId: string,
    memoryKey: string,
    entityId?: string | null,
  ): Promise<{ current: MemoryFact | null; original: MemoryFact | null; considered: MemoryFact[] }> {
    const all = (await this.facts
      .listForUser(userId, {
        limit: 100,
        memoryKey,
        entityId: entityId ?? undefined,
        activeOnly: false,
      }))
      .filter((f) => f.category === "decision" || f.memoryType === "decision")
      .sort(
        (a, b) =>
          (a.observedAt ?? a.createdAt).getTime() -
          (b.observedAt ?? b.createdAt).getTime(),
      );

    const current =
      [...all]
        .reverse()
        .find(
          (f) =>
            f.isActive &&
            ["confirmed", "implemented"].includes(f.assertionStatus),
        ) ?? null;
    const original =
      all.find((f) =>
        ["confirmed", "implemented", "superseded"].includes(f.assertionStatus),
      ) ?? null;
    const considered = all.filter((f) =>
      ["considered", "proposed"].includes(f.assertionStatus),
    );

    return { current, original, considered };
  }
}
