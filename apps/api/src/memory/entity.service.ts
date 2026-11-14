import type { AppDatabase } from "../db/index.js";
import type { Entity, EntityType } from "../db/schema.js";
import { EntityRepository } from "../repositories/entity.repository.js";
import type { ExtractedEntity } from "./memory.types.js";

export class EntityService {
  private readonly entities: EntityRepository;

  constructor(db: AppDatabase) {
    this.entities = new EntityRepository(db);
  }

  async getById(id: string): Promise<Entity | undefined> {
    return this.entities.findById(id);
  }

  async search(options: {
    q?: string;
    entityType?: EntityType;
    limit: number;
  }): Promise<Entity[]> {
    return this.entities.search(options);
  }

  async listForConversation(conversationId: string): Promise<Entity[]> {
    return this.entities.listForConversation(conversationId);
  }

  async upsertExtracted(
    conversationId: string,
    extracted: ExtractedEntity[],
  ): Promise<Entity[]> {
    const results: Entity[] = [];

    for (const item of extracted) {
      const entity = await this.entities.upsert({
        entityType: item.entityType,
        displayName: item.displayName,
        aliases: item.aliases,
      });
      await this.entities.linkToConversation(conversationId, entity.id);
      results.push(entity);
    }

    return results;
  }
}
