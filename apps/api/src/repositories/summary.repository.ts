import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  conversationSummaries,
  type ConversationSummary,
} from "../db/schema.js";

export class SummaryRepository {
  constructor(private readonly db: AppDatabase) {}

  async getLatest(conversationId: string): Promise<ConversationSummary | undefined> {
    return (await this.db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .orderBy(desc(conversationSummaries.version))
      .limit(1))[0];
  }

  async listVersions(conversationId: string): Promise<ConversationSummary[]> {
    return await this.db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.conversationId, conversationId))
      .orderBy(desc(conversationSummaries.version));
  }

  async nextVersion(conversationId: string): Promise<number> {
    const latest = await this.getLatest(conversationId);
    return (latest?.version ?? 0) + 1;
  }

  async create(input: {
    conversationId: string;
    summary: string;
    coveredThroughMessageId: number;
    model: string;
    version?: number;
  }): Promise<ConversationSummary> {
    const version = input.version ?? await this.nextVersion(input.conversationId);
    const id = randomUUID();

    await this.db
      .insert(conversationSummaries)
      .values({
        id,
        conversationId: input.conversationId,
        version,
        summary: input.summary,
        coveredThroughMessageId: input.coveredThroughMessageId,
        model: input.model,
        createdAt: new Date(),
      });

    const row = (await this.db
      .select()
      .from(conversationSummaries)
      .where(
        and(
          eq(conversationSummaries.conversationId, input.conversationId),
          eq(conversationSummaries.version, version),
        ),
      ).limit(1))[0];

    if (!row) {
      throw new Error("Failed to create conversation summary");
    }
    return row;
  }
}
