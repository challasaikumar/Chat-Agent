import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../../db/index.js";
import {
  memoryEntityRelationships,
  type MemoryEntityRelationship,
} from "../../db/schema.js";

export class MemoryRelationshipService {
  constructor(private readonly db: AppDatabase) {}

  async listForEntity(
    userId: string,
    entityId: string,
    limit = 50,
  ): Promise<MemoryEntityRelationship[]> {
    return (await this.db
      .select()
      .from(memoryEntityRelationships)
      .where(
        and(
          eq(memoryEntityRelationships.userId, userId),
          eq(memoryEntityRelationships.isActive, true),
          eq(memoryEntityRelationships.sourceEntityId, entityId),
        ),
      )
      .orderBy(desc(memoryEntityRelationships.updatedAt))
      .limit(limit))
      .concat(
        (await this.db
          .select()
          .from(memoryEntityRelationships)
          .where(
            and(
              eq(memoryEntityRelationships.userId, userId),
              eq(memoryEntityRelationships.isActive, true),
              eq(memoryEntityRelationships.targetEntityId, entityId),
            ),
          )
          .orderBy(desc(memoryEntityRelationships.updatedAt))
          .limit(limit)),
      );
  }

  async findActive(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string,
    relationshipType: string,
  ): Promise<MemoryEntityRelationship | undefined> {
    return (await this.db
      .select()
      .from(memoryEntityRelationships)
      .where(
        and(
          eq(memoryEntityRelationships.userId, userId),
          eq(memoryEntityRelationships.sourceEntityId, sourceEntityId),
          eq(memoryEntityRelationships.targetEntityId, targetEntityId),
          eq(memoryEntityRelationships.relationshipType, relationshipType),
          eq(memoryEntityRelationships.isActive, true),
        ),
      ).limit(1))[0];
  }

  async upsert(input: {
    userId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    description?: string | null;
    confidence: number;
    sourceMessageId?: number | null;
    sourceConversationId?: string | null;
  }): Promise<MemoryEntityRelationship> {
    if (input.sourceEntityId === input.targetEntityId) {
      throw new Error("Self-referencing relationships are not allowed");
    }

    const existing = await this.findActive(
      input.userId,
      input.sourceEntityId,
      input.targetEntityId,
      input.relationshipType,
    );
    const now = new Date();
    if (existing) {
      await this.db
        .update(memoryEntityRelationships)
        .set({
          description: input.description ?? existing.description,
          confidence: Math.max(existing.confidence, input.confidence),
          sourceMessageId: input.sourceMessageId ?? existing.sourceMessageId,
          sourceConversationId:
            input.sourceConversationId ?? existing.sourceConversationId,
          updatedAt: now,
        })
        .where(eq(memoryEntityRelationships.id, existing.id));
      return (await this.db
        .select()
        .from(memoryEntityRelationships)
        .where(eq(memoryEntityRelationships.id, existing.id)).limit(1))[0]!;
    }

    const id = randomUUID();
    await this.db
      .insert(memoryEntityRelationships)
      .values({
        id,
        userId: input.userId,
        sourceEntityId: input.sourceEntityId,
        targetEntityId: input.targetEntityId,
        relationshipType: input.relationshipType.trim().toLowerCase(),
        description: input.description ?? null,
        confidence: input.confidence,
        sourceMessageId: input.sourceMessageId ?? null,
        sourceConversationId: input.sourceConversationId ?? null,
        validFrom: now,
        validTo: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

    return (await this.db
      .select()
      .from(memoryEntityRelationships)
      .where(eq(memoryEntityRelationships.id, id)).limit(1))[0]!;
  }

  async deactivate(id: string, userId: string): Promise<void> {
    await this.db
      .update(memoryEntityRelationships)
      .set({
        isActive: false,
        validTo: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memoryEntityRelationships.id, id),
          eq(memoryEntityRelationships.userId, userId),
        ),
      );
  }
}
