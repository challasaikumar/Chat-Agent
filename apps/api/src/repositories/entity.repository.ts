import { and, desc, eq, ilike, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  conversationEntities,
  entities,
  type Entity,
  type EntityType,
} from "../db/schema.js";
import { normalizeCanonicalName } from "../utils/normalize.js";

export class EntityRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string): Promise<Entity | undefined> {
    return (await this.db.select().from(entities).where(eq(entities.id, id)).limit(1))[0];
  }

  async findByTypeAndCanonical(
    entityType: EntityType,
    canonicalName: string,
  ): Promise<Entity | undefined> {
    return (await this.db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.entityType, entityType),
          eq(entities.canonicalName, normalizeCanonicalName(canonicalName)),
        ),
      ).limit(1))[0];
  }

  async upsert(input: {
    entityType: EntityType;
    displayName: string;
    aliases?: string[];
  }): Promise<Entity> {
    const canonicalName = normalizeCanonicalName(input.displayName);
    const existing = await this.findByTypeAndCanonical(input.entityType, canonicalName);
    const now = new Date();

    if (existing) {
      const mergedAliases = Array.from(
        new Set([
          ...(existing.aliases ?? []),
          ...(input.aliases ?? []),
          input.displayName,
        ].map((a) => a.trim()).filter(Boolean)),
      );

      await this.db
        .update(entities)
        .set({
          displayName: input.displayName.trim() || existing.displayName,
          aliases: mergedAliases,
          updatedAt: now,
        })
        .where(eq(entities.id, existing.id));

      return (await this.findById(existing.id))!;
    }

    const id = randomUUID();
    await this.db
      .insert(entities)
      .values({
        id,
        entityType: input.entityType,
        canonicalName,
        displayName: input.displayName.trim(),
        aliases: Array.from(
          new Set([...(input.aliases ?? []), input.displayName]
            .map((a) => a.trim())
            .filter(Boolean)),
        ),
        createdAt: now,
        updatedAt: now,
      });

    return (await this.findById(id))!;
  }

  async linkToConversation(conversationId: string, entityId: string, seenAt = new Date()): Promise<void> {
    const existing = (await this.db
      .select()
      .from(conversationEntities)
      .where(
        and(
          eq(conversationEntities.conversationId, conversationId),
          eq(conversationEntities.entityId, entityId),
        ),
      ).limit(1))[0];

    if (existing) {
      await this.db
        .update(conversationEntities)
        .set({ lastSeenAt: seenAt })
        .where(
          and(
            eq(conversationEntities.conversationId, conversationId),
            eq(conversationEntities.entityId, entityId),
          ),
        );
      return;
    }

    await this.db
      .insert(conversationEntities)
      .values({
        conversationId,
        entityId,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      });
  }

  async search(options: {
    q?: string;
    entityType?: EntityType;
    limit: number;
  }): Promise<Entity[]> {
    const conditions = [];

    if (options.entityType) {
      conditions.push(eq(entities.entityType, options.entityType));
    }

    if (options.q?.trim()) {
      const needle = `%${normalizeCanonicalName(options.q)}%`;
      conditions.push(
        or(
          ilike(entities.canonicalName, needle),
          ilike(entities.displayName, needle),
        )!,
      );
    }

    if (conditions.length === 0) {
      return await this.db
        .select()
        .from(entities)
        .orderBy(desc(entities.updatedAt))
        .limit(options.limit);
    }

    return await this.db
      .select()
      .from(entities)
      .where(and(...conditions))
      .orderBy(desc(entities.updatedAt))
      .limit(options.limit);
  }

  async listForConversation(conversationId: string): Promise<Entity[]> {
    return await this.db
      .select({
        id: entities.id,
        entityType: entities.entityType,
        canonicalName: entities.canonicalName,
        displayName: entities.displayName,
        aliases: entities.aliases,
        createdAt: entities.createdAt,
        updatedAt: entities.updatedAt,
      })
      .from(conversationEntities)
      .innerJoin(entities, eq(conversationEntities.entityId, entities.id))
      .where(eq(conversationEntities.conversationId, conversationId))
      .orderBy(desc(conversationEntities.lastSeenAt));
  }
}
