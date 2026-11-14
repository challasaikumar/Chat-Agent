import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  memoryFacts,
  type AssertionStatus,
  type AssertionType,
  type FactCategory,
  type MemoryFact,
  type MemoryType,
} from "../db/schema.js";
import { normalizeFactKey } from "../utils/normalize.js";

export type CreateFactInput = {
  userId: string;
  entityId?: string | null;
  category: FactCategory;
  fact: string;
  confidence: number;
  importance?: number;
  memoryType?: MemoryType;
  memoryKey?: string | null;
  normalizedValue?: string | null;
  assertionType?: AssertionType;
  assertionStatus?: AssertionStatus;
  sourceMessageId: number;
  sourceConversationId: string;
  evidenceExcerpt: string;
  expiresAt?: Date | null;
  validFrom?: Date | null;
  observedAt?: Date | null;
  supersedesFactId?: string | null;
  entityName?: string | null;
};

export class FactRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string, userId: string): Promise<MemoryFact | undefined> {
    return (await this.db
      .select()
      .from(memoryFacts)
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId))).limit(1))[0];
  }

  async listForUser(
    userId: string,
    options: {
      limit: number;
      activeOnly?: boolean;
      category?: FactCategory;
      entityId?: string;
      conversationId?: string;
      memoryKey?: string;
      assertionStatus?: AssertionStatus;
      memoryType?: MemoryType;
    },
  ): Promise<MemoryFact[]> {
    const conditions = [eq(memoryFacts.userId, userId)];

    if (options.activeOnly !== false) {
      conditions.push(eq(memoryFacts.isActive, true));
      conditions.push(
        sql`${memoryFacts.assertionStatus} NOT IN ('retracted', 'superseded')`,
      );
    }
    if (options.category) {
      conditions.push(eq(memoryFacts.category, options.category));
    }
    if (options.entityId) {
      conditions.push(eq(memoryFacts.entityId, options.entityId));
    }
    if (options.conversationId) {
      conditions.push(eq(memoryFacts.sourceConversationId, options.conversationId));
    }
    if (options.memoryKey) {
      conditions.push(eq(memoryFacts.memoryKey, options.memoryKey));
    }
    if (options.assertionStatus) {
      conditions.push(eq(memoryFacts.assertionStatus, options.assertionStatus));
    }
    if (options.memoryType) {
      conditions.push(eq(memoryFacts.memoryType, options.memoryType));
    }

    return await this.db
      .select()
      .from(memoryFacts)
      .where(and(...conditions))
      .orderBy(desc(memoryFacts.updatedAt), desc(memoryFacts.createdAt))
      .limit(options.limit);
  }

  async findActiveByMemoryKey(
    userId: string,
    memoryKey: string,
    entityId?: string | null,
  ): Promise<MemoryFact | undefined> {
    const conditions = [
      eq(memoryFacts.userId, userId),
      eq(memoryFacts.memoryKey, memoryKey),
      eq(memoryFacts.isActive, true),
      sql`${memoryFacts.assertionStatus} NOT IN ('retracted', 'superseded')`,
    ];
    if (entityId) {
      conditions.push(eq(memoryFacts.entityId, entityId));
    }
    return (await this.db
      .select()
      .from(memoryFacts)
      .where(and(...conditions))
      .orderBy(desc(memoryFacts.createdAt)).limit(1))[0];
  }

  async findActiveDuplicate(
    userId: string,
    fact: string,
    sourceConversationId: string,
  ): Promise<MemoryFact | undefined> {
    const key = normalizeFactKey(fact);
    const rows = await this.db
      .select()
      .from(memoryFacts)
      .where(
        and(
          eq(memoryFacts.userId, userId),
          eq(memoryFacts.isActive, true),
          eq(memoryFacts.sourceConversationId, sourceConversationId),
        ),
      );

    return rows.find((row: MemoryFact) => normalizeFactKey(row.fact) === key);
  }

  async listHistory(
    userId: string,
    factId: string,
  ): Promise<MemoryFact[]> {
    const current = await this.findById(factId, userId);
    if (!current) {
      return [];
    }
    const key = current.memoryKey;
    if (!key) {
      return [current];
    }
    const conditions = [
      eq(memoryFacts.userId, userId),
      eq(memoryFacts.memoryKey, key),
    ];
    if (current.entityId) {
      conditions.push(eq(memoryFacts.entityId, current.entityId));
    } else {
      conditions.push(isNull(memoryFacts.entityId));
    }
    return await this.db
      .select()
      .from(memoryFacts)
      .where(and(...conditions))
      .orderBy(desc(memoryFacts.createdAt));
  }

  async create(input: CreateFactInput): Promise<MemoryFact> {
    const memoryKey =
      input.memoryKey?.trim() ||
      deriveMemoryKey(input.category, input.fact, input.normalizedValue);

    // Exact duplicate in same conversation → refresh
    const duplicate = await this.findActiveDuplicate(
      input.userId,
      input.fact,
      input.sourceConversationId,
    );
    if (duplicate && !input.supersedesFactId) {
      if (input.confidence >= duplicate.confidence) {
        await this.db
          .update(memoryFacts)
          .set({
            confidence: input.confidence,
            importance: input.importance ?? duplicate.importance,
            sourceMessageId: input.sourceMessageId,
            evidenceExcerpt: input.evidenceExcerpt,
            entityId: input.entityId ?? duplicate.entityId,
            memoryKey: memoryKey || duplicate.memoryKey,
            normalizedValue: input.normalizedValue ?? duplicate.normalizedValue,
            lastConfirmedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(memoryFacts.id, duplicate.id));
        // memory_facts.search_vector is maintained by a DB trigger (see db/fts.ts).
        return (await this.findById(duplicate.id, input.userId))!;
      }
      return duplicate;
    }

    const id = randomUUID();
    const now = new Date();
    const observedAt = input.observedAt ?? now;
    await this.db
      .insert(memoryFacts)
      .values({
        id,
        userId: input.userId,
        entityId: input.entityId ?? null,
        category: input.category,
        memoryType: input.memoryType ?? mapCategoryToType(input.category),
        memoryKey,
        fact: input.fact.trim(),
        normalizedValue: input.normalizedValue ?? normalizeFactKey(input.fact),
        confidence: input.confidence,
        importance: input.importance ?? 0.5,
        assertionType: input.assertionType ?? "explicitly_stated",
        assertionStatus: input.assertionStatus ?? "confirmed",
        sourceMessageId: input.sourceMessageId,
        sourceConversationId: input.sourceConversationId,
        evidenceExcerpt: input.evidenceExcerpt,
        validFrom: input.validFrom ?? observedAt,
        validTo: null,
        observedAt,
        lastConfirmedAt:
          (input.assertionStatus ?? "confirmed") === "confirmed" ||
          (input.assertionStatus ?? "confirmed") === "implemented"
            ? observedAt
            : null,
        lastAccessedAt: null,
        accessCount: 0,
        expiresAt: input.expiresAt ?? null,
        supersedesFactId: input.supersedesFactId ?? null,
        supersededByFactId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

    return (await this.findById(id, input.userId))!;
  }

  /**
   * Append-only supersession: mark previous active fact superseded and create a new current fact.
   */
  async supersede(
    previous: MemoryFact,
    input: Omit<CreateFactInput, "supersedesFactId" | "userId"> & {
      userId: string;
    },
  ): Promise<MemoryFact> {
    const now = new Date();
    const created = await this.create({
      ...input,
      supersedesFactId: previous.id,
    });

    await this.db
      .update(memoryFacts)
      .set({
        assertionStatus: "superseded",
        isActive: false,
        validTo: now,
        supersededByFactId: created.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(memoryFacts.id, previous.id),
          eq(memoryFacts.userId, input.userId),
        ),
      );

    return created;
  }

  async retract(id: string, userId: string): Promise<MemoryFact | undefined> {
    const existing = await this.findById(id, userId);
    if (!existing) {
      return undefined;
    }
    const now = new Date();
    await this.db
      .update(memoryFacts)
      .set({
        assertionStatus: "retracted",
        isActive: false,
        validTo: existing.validTo ?? now,
        updatedAt: now,
      })
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId)));

    return this.findById(id, userId);
  }

  async deactivate(id: string, userId: string): Promise<MemoryFact | undefined> {
    return this.retract(id, userId);
  }

  async patch(
    id: string,
    userId: string,
    updates: {
      fact?: string;
      assertionStatus?: AssertionStatus;
      isActive?: boolean;
      importance?: number;
    },
  ): Promise<MemoryFact | undefined> {
    const existing = await this.findById(id, userId);
    if (!existing) {
      return undefined;
    }
    await this.db
      .update(memoryFacts)
      .set({
        fact: updates.fact?.trim() ?? existing.fact,
        assertionStatus: updates.assertionStatus ?? existing.assertionStatus,
        isActive: updates.isActive ?? existing.isActive,
        importance: updates.importance ?? existing.importance,
        updatedAt: new Date(),
      })
      .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId)));
    return (await this.findById(id, userId))!;
  }

  async touchAccess(ids: string[], userId: string): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const now = new Date();
    for (const id of ids) {
      await this.db
        .update(memoryFacts)
        .set({
          lastAccessedAt: now,
          accessCount: sql`${memoryFacts.accessCount} + 1`,
          updatedAt: now,
        })
        .where(and(eq(memoryFacts.id, id), eq(memoryFacts.userId, userId)));
    }
  }

  async countForUser(userId: string): Promise<{
    active: number;
    preferences: number;
    decisions: number;
    projects: number;
  }> {
    const active = (await this.db
      .select({ count: sql<number>`count(*)` })
      .from(memoryFacts)
      .where(
        and(
          eq(memoryFacts.userId, userId),
          eq(memoryFacts.isActive, true),
        ),
      ).limit(1))[0]?.count ?? 0;

    const preferences = (await this.listForUser(userId, {
      limit: 1000,
      category: "preference",
    })).length;
    const decisions = (await this.listForUser(userId, {
      limit: 1000,
      category: "decision",
    })).length;
    const projects = (await this.listForUser(userId, {
      limit: 1000,
      category: "project_context",
    })).length;

    return { active: Number(active), preferences, decisions, projects };
  }
}

function mapCategoryToType(category: FactCategory): MemoryType {
  switch (category) {
    case "preference":
      return "preference";
    case "decision":
      return "decision";
    case "project_context":
    case "technical_context":
    case "requirement":
    case "constraint":
    case "goal":
      return "project";
    case "relationship":
      return "relationship";
    default:
      return "semantic";
  }
}

export function deriveMemoryKey(
  category: FactCategory,
  fact: string,
  normalizedValue?: string | null,
): string {
  if (normalizedValue?.trim()) {
    return `${category}:${normalizeFactKey(normalizedValue)}`.slice(0, 300);
  }
  // Prefer attribute-like prefix before ":" or "is/uses"
  const compact = normalizeFactKey(fact).slice(0, 280);
  return `${category}:${compact}`;
}

void or;
