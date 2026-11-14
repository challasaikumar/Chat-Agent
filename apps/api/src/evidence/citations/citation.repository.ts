import { and, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../db/index.js";
import {
  memoryFacts,
  researchClaims,
  researchSources,
  researchSnapshots,
} from "../../db/schema.js";

/**
 * Ownership lookups for citation validation — uses existing Phase 03–06 tables.
 */
export class CitationEvidenceRepository {
  constructor(private readonly db: AppDatabase) {}

  async listPersistedSourceUrls(input: {
    userId: string;
    sourceIds?: string[];
  }): Promise<string[]> {
    const rows = input.sourceIds?.length
      ? await this.db
          .select({
            url: researchSources.url,
            userId: researchSnapshots.userId,
          })
          .from(researchSources)
          .innerJoin(
            researchSnapshots,
            eq(researchSources.snapshotId, researchSnapshots.id),
          )
          .where(
            and(
              eq(researchSnapshots.userId, input.userId),
              inArray(researchSources.id, input.sourceIds),
            ),
          )
      : await this.db
          .select({
            url: researchSources.url,
            userId: researchSnapshots.userId,
          })
          .from(researchSources)
          .innerJoin(
            researchSnapshots,
            eq(researchSources.snapshotId, researchSnapshots.id),
          )
          .where(eq(researchSnapshots.userId, input.userId))
          .limit(500);

    return rows.map((r) => r.url);
  }

  async claimOwnedByUser(claimId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: researchClaims.id })
      .from(researchClaims)
      .where(
        and(eq(researchClaims.id, claimId), eq(researchClaims.userId, userId)),
      )
      .limit(1);
    return rows.length > 0;
  }

  async memoryFactOwnedByUser(factId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: memoryFacts.id })
      .from(memoryFacts)
      .where(and(eq(memoryFacts.id, factId), eq(memoryFacts.userId, userId)))
      .limit(1);
    return rows.length > 0;
  }
}
