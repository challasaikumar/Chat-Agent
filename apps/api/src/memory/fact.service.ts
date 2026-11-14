import type { AppDatabase } from "../db/index.js";
import type { FactCategory, MemoryFact } from "../db/schema.js";
import { FactRepository, deriveMemoryKey } from "../repositories/fact.repository.js";
import { EntityRepository } from "../repositories/entity.repository.js";
import type { ExtractedFact, ExtractedRelationship } from "./memory.types.js";
import { shouldSupersede } from "./consolidation/memory-versioning.js";
import { MemoryRelationshipService } from "./entities/memory-relationship.service.js";
import { MemoryPrivacyService } from "./privacy/memory-privacy.service.js";
import { detectConflicts } from "./consolidation/memory-conflict-detector.js";

export class FactService {
  private readonly facts: FactRepository;
  private readonly entities: EntityRepository;
  private readonly relationships: MemoryRelationshipService;
  private readonly privacy: MemoryPrivacyService;

  constructor(db: AppDatabase) {
    this.facts = new FactRepository(db);
    this.entities = new EntityRepository(db);
    this.relationships = new MemoryRelationshipService(db);
    this.privacy = new MemoryPrivacyService(db);
  }

  async list(options: {
    userId: string;
    limit: number;
    category?: FactCategory;
    entityId?: string;
    conversationId?: string;
    activeOnly?: boolean;
  }): Promise<MemoryFact[]> {
    return this.facts.listForUser(options.userId, options);
  }

  async getById(id: string, userId: string): Promise<MemoryFact | undefined> {
    return this.facts.findById(id, userId);
  }

  async getHistory(id: string, userId: string): Promise<MemoryFact[]> {
    return this.facts.listHistory(userId, id);
  }

  async upsertExtracted(
    userId: string,
    conversationId: string,
    extracted: ExtractedFact[],
    validMessageIds: Set<number>,
  ): Promise<{
    facts: MemoryFact[];
    duplicatesRejected: number;
    conflictsDetected: number;
  }> {
    const results: MemoryFact[] = [];
    let duplicatesRejected = 0;

    for (const item of extracted) {
      if (!validMessageIds.has(item.sourceMessageId)) {
        continue;
      }

      const excerpt = item.evidenceExcerpt.trim();
      if (!excerpt) {
        continue;
      }

      if (
        !this.privacy.isSafeContent(item.fact) ||
        !this.privacy.isSafeContent(excerpt)
      ) {
        continue;
      }

      // Never convert questions into confirmed facts
      if (/\?\s*$/.test(item.fact.trim()) || /^did |^what |^how |^when /i.test(item.fact)) {
        continue;
      }

      let entityId: string | null = null;
      let entityName: string | null = null;
      if (item.entityDisplayName && item.entityType) {
        const entity = await this.entities.upsert({
          entityType: item.entityType,
          displayName: item.entityDisplayName,
        });
        entityId = entity.id;
        entityName = entity.displayName;
      }

      // Prefer project entity when provided
      if (item.projectDisplayName) {
        const project = await this.entities.upsert({
          entityType: "project",
          displayName: item.projectDisplayName,
        });
        entityId = project.id;
        entityName = project.displayName;
      }

      const memoryKey =
        item.memoryKey?.trim() ||
        deriveMemoryKey(item.category, item.fact, item.normalizedValue);
      const assertionStatus = item.assertionStatus ?? "confirmed";

      const existing = await this.facts.findActiveByMemoryKey(
        userId,
        memoryKey,
        entityId,
      );

      if (existing) {
        const decision = shouldSupersede(existing, {
          assertionStatus,
          confidence: item.confidence,
          fact: item.fact,
        });
        if (decision === "duplicate") {
          duplicatesRejected += 1;
          results.push(existing);
          continue;
        }
        if (decision === "reject_candidate") {
          duplicatesRejected += 1;
          continue;
        }
        if (decision === "supersede") {
          const created = await this.facts.supersede(existing, {
            userId,
            entityId,
            category: item.category,
            fact: item.fact,
            confidence: item.confidence,
            importance: item.importance ?? 0.5,
            memoryType: item.memoryType,
            memoryKey,
            normalizedValue: item.normalizedValue,
            assertionType: item.assertionType,
            assertionStatus,
            sourceMessageId: item.sourceMessageId,
            sourceConversationId: conversationId,
            evidenceExcerpt: excerpt,
            entityName,
          });
          results.push(created);
          continue;
        }
        // keep_both → create without superseding
      }

      const fact = await this.facts.create({
        userId,
        entityId,
        category: item.category,
        fact: item.fact,
        confidence: item.confidence,
        importance: item.importance ?? 0.5,
        memoryType: item.memoryType,
        memoryKey,
        normalizedValue: item.normalizedValue,
        assertionType: item.assertionType,
        assertionStatus,
        sourceMessageId: item.sourceMessageId,
        sourceConversationId: conversationId,
        evidenceExcerpt: excerpt,
        entityName,
      });
      results.push(fact);
    }

    const conflicts = detectConflicts(
      await this.facts.listForUser(userId, { limit: 200, activeOnly: false }),
    );

    return {
      facts: results,
      duplicatesRejected,
      conflictsDetected: conflicts.length,
    };
  }

  async upsertRelationships(
    userId: string,
    conversationId: string,
    extracted: ExtractedRelationship[],
    validMessageIds: Set<number>,
  ): Promise<number> {
    let count = 0;
    for (const item of extracted) {
      if (
        item.sourceMessageId != null &&
        !validMessageIds.has(item.sourceMessageId)
      ) {
        continue;
      }
      if (item.sourceEntityDisplayName === item.targetEntityDisplayName) {
        continue;
      }
      const source = await this.entities.upsert({
        entityType: item.sourceEntityType,
        displayName: item.sourceEntityDisplayName,
      });
      const target = await this.entities.upsert({
        entityType: item.targetEntityType,
        displayName: item.targetEntityDisplayName,
      });
      await this.entities.linkToConversation(conversationId, source.id);
      await this.entities.linkToConversation(conversationId, target.id);
      await this.relationships.upsert({
        userId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        relationshipType: item.relationshipType,
        description: item.description,
        confidence: item.confidence,
        sourceMessageId: item.sourceMessageId,
        sourceConversationId: conversationId,
      });
      count += 1;
    }
    return count;
  }
}
