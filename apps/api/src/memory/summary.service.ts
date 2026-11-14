import type { AppDatabase } from "../db/index.js";
import type { ConversationSummary } from "../db/schema.js";
import { SummaryRepository } from "../repositories/summary.repository.js";

export class SummaryService {
  private readonly summaries: SummaryRepository;

  constructor(db: AppDatabase) {
    this.summaries = new SummaryRepository(db);
  }

  async getLatest(conversationId: string): Promise<ConversationSummary | undefined> {
    return this.summaries.getLatest(conversationId);
  }

  async listVersions(conversationId: string): Promise<ConversationSummary[]> {
    return this.summaries.listVersions(conversationId);
  }

  async createVersion(input: {
    conversationId: string;
    summary: string;
    coveredThroughMessageId: number;
    model: string;
  }): Promise<ConversationSummary> {
    return this.summaries.create(input);
  }
}
