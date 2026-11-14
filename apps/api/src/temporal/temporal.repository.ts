import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  temporalComparisonItems,
  temporalComparisons,
  type TemporalComparison,
  type TemporalComparisonItem,
} from "../db/schema.js";
import type { ComparisonEngineResult } from "./comparison/comparison.types.js";
import type { ConfidenceLevel } from "./temporal.types.js";

export class TemporalRepository {
  constructor(private readonly db: AppDatabase) {}

  async createComparison(input: {
    userId: string;
    conversationId: string;
    agentRunId?: string | null;
    entityId?: string | null;
    comparisonType: string;
    referenceFrom: string | null;
    referenceTo: string;
    timeZone: string;
    result: ComparisonEngineResult;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ comparison: TemporalComparison; items: TemporalComparisonItem[] }> {
    const id = randomUUID();
    const now = new Date();

    return this.db.transaction(async (tx) => {
      await tx.insert(temporalComparisons)
        .values({
          id,
          userId: input.userId,
          conversationId: input.conversationId,
          agentRunId: input.agentRunId ?? null,
          entityId: input.entityId ?? null,
          comparisonType: input.comparisonType,
          referenceFrom: input.referenceFrom,
          referenceTo: input.referenceTo,
          timeZone: input.timeZone,
          status: input.result.status,
          resultSummary: input.result.resultSummary,
          confidence: input.result.confidence,
          metadata: input.metadata ?? null,
          createdAt: now,
          updatedAt: now,
        });

      const items: TemporalComparisonItem[] = [];
      for (const item of input.result.items) {
        const itemId = randomUUID();
        await tx.insert(temporalComparisonItems)
          .values({
            id: itemId,
            comparisonId: id,
            attribute: item.attribute,
            category: item.category,
            historicalClaimId: item.historicalClaimId,
            currentClaimId: item.currentClaimId,
            changeType: item.changeType,
            historicalValue: item.historicalValue,
            currentValue: item.currentValue,
            absoluteDifference: item.absoluteDifference,
            percentageDifference: item.percentageDifference,
            currency: item.currency,
            billingPeriod: item.billingPeriod,
            confidence: item.confidence as ConfidenceLevel,
            evidenceMetadata: item.evidenceMetadata,
            createdAt: now,
          });

        const row = (await tx
          .select()
          .from(temporalComparisonItems)
          .where(eq(temporalComparisonItems.id, itemId)).limit(1))[0];
        if (row) {
          items.push(row);
        }
      }

      const comparison = (await tx
        .select()
        .from(temporalComparisons)
        .where(eq(temporalComparisons.id, id)).limit(1))[0];

      if (!comparison) {
        throw new Error("Failed to persist temporal comparison");
      }

      return { comparison, items };
    });
  }

  async findComparisonForUser(
    id: string,
    userId: string,
  ): Promise<TemporalComparison | undefined> {
    return (await this.db
      .select()
      .from(temporalComparisons)
      .where(
        and(
          eq(temporalComparisons.id, id),
          eq(temporalComparisons.userId, userId),
        ),
      ).limit(1))[0];
  }

  async listComparisonsForUser(
    userId: string,
    options: { limit: number; conversationId?: string },
  ): Promise<TemporalComparison[]> {
    const conditions = [eq(temporalComparisons.userId, userId)];
    if (options.conversationId) {
      conditions.push(
        eq(temporalComparisons.conversationId, options.conversationId),
      );
    }
    return await this.db
      .select()
      .from(temporalComparisons)
      .where(and(...conditions))
      .orderBy(desc(temporalComparisons.createdAt))
      .limit(options.limit);
  }

  async listItems(comparisonId: string): Promise<TemporalComparisonItem[]> {
    return await this.db
      .select()
      .from(temporalComparisonItems)
      .where(eq(temporalComparisonItems.comparisonId, comparisonId));
  }
}
