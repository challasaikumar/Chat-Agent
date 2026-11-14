import type { AppDatabase } from "../../db/index.js";
import type { MemoryFact } from "../../db/schema.js";
import { FactRepository } from "../../repositories/fact.repository.js";
import type { MemoryConfig } from "../memory.config.js";

export class PreferenceService {
  private readonly facts: FactRepository;

  constructor(
    db: AppDatabase,
    private readonly config: MemoryConfig,
  ) {
    this.facts = new FactRepository(db);
  }

  async list(userId: string, limit = 50): Promise<MemoryFact[]> {
    return this.facts.listForUser(userId, {
      limit,
      category: "preference",
      activeOnly: true,
    });
  }

  /**
   * Only promote unconfirmed inferences after repeated evidence threshold.
   */
  shouldPromoteInference(existingCount: number): boolean {
    return existingCount >= this.config.preferenceConfirmationThreshold;
  }
}
