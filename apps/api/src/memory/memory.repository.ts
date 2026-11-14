import type { AppDatabase } from "../db/index.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { EntityRepository } from "../repositories/entity.repository.js";
import { FactRepository } from "../repositories/fact.repository.js";
import { FtsRepository } from "../repositories/fts.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { SummaryRepository } from "../repositories/summary.repository.js";

/**
 * Facade over memory-related repositories for orchestration layers.
 */
export class MemoryRepository {
  readonly conversations: ConversationRepository;
  readonly messages: MessageRepository;
  readonly summaries: SummaryRepository;
  readonly entities: EntityRepository;
  readonly facts: FactRepository;
  readonly research: ResearchRepository;
  readonly fts: FtsRepository;

  constructor(db: AppDatabase) {
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.summaries = new SummaryRepository(db);
    this.entities = new EntityRepository(db);
    this.facts = new FactRepository(db);
    this.research = new ResearchRepository(db);
    this.fts = new FtsRepository(db);
  }
}
