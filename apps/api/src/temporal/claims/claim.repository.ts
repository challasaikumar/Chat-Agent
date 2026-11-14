import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../db/index.js";
import {
  researchClaims,
  type ResearchClaim,
} from "../../db/schema.js";
import type { DraftClaim } from "./claim.types.js";

export class ClaimRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByIdForUser(id: string, userId: string): Promise<ResearchClaim | undefined> {
    return (await this.db
      .select()
      .from(researchClaims)
      .where(and(eq(researchClaims.id, id), eq(researchClaims.userId, userId))).limit(1))[0];
  }

  async listForUser(
    userId: string,
    options: {
      limit?: number;
      snapshotIds?: string[];
      entityId?: string;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<ResearchClaim[]> {
    const limit = options.limit ?? 100;
    const conditions = [eq(researchClaims.userId, userId)];
    if (options.snapshotIds?.length) {
      conditions.push(inArray(researchClaims.snapshotId, options.snapshotIds));
    }
    if (options.entityId) {
      conditions.push(eq(researchClaims.entityId, options.entityId));
    }
    if (options.from) {
      conditions.push(gte(researchClaims.observedAt, options.from));
    }
    if (options.to) {
      conditions.push(lte(researchClaims.observedAt, options.to));
    }

    return await this.db
      .select()
      .from(researchClaims)
      .where(and(...conditions))
      .orderBy(desc(researchClaims.observedAt))
      .limit(limit);
  }

  async listForSource(sourceId: string): Promise<ResearchClaim[]> {
    return await this.db
      .select()
      .from(researchClaims)
      .where(eq(researchClaims.sourceId, sourceId));
  }

  async insertMany(userId: string, drafts: DraftClaim[]): Promise<ResearchClaim[]> {
    const inserted: ResearchClaim[] = [];
    for (const draft of drafts) {
      const existing = (await this.db
        .select()
        .from(researchClaims)
        .where(
          and(
            eq(researchClaims.sourceId, draft.sourceId),
            eq(researchClaims.attribute, draft.attribute),
            eq(researchClaims.contentHash, draft.contentHash),
          ),
        ).limit(1))[0];
      if (existing) {
        inserted.push(existing);
        continue;
      }

      const id = randomUUID();
      await this.db
        .insert(researchClaims)
        .values({
          id,
          userId,
          entityId: draft.entityId,
          entityName: draft.entityName,
          category: draft.category,
          attribute: draft.attribute,
          originalValue: draft.originalValue,
          normalizedValue: draft.normalizedValue,
          numericValue: draft.numericValue,
          currency: draft.currency,
          billingPeriod: draft.billingPeriod,
          billingBasis: draft.billingBasis,
          unit: draft.unit,
          planName: draft.planName,
          region: draft.region,
          seatCount: draft.seatCount,
          featureName: draft.featureName,
          sourceId: draft.sourceId,
          snapshotId: draft.snapshotId,
          sourceUrl: draft.sourceUrl,
          evidenceExcerpt: draft.evidenceExcerpt,
          contentHash: draft.contentHash,
          publishedAt: draft.publishedAt,
          effectiveAt: draft.effectiveAt,
          observedAt: draft.observedAt,
          extractionConfidence: draft.extractionConfidence,
          extractionModel: draft.extractionModel,
          verificationStatus: draft.verificationStatus,
          createdAt: new Date(),
        });

      const row = await this.findByIdForUser(id, userId);
      if (row) {
        inserted.push(row);
      }
    }
    return inserted;
  }
}
