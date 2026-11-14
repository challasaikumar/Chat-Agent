import { eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import {
  agentRuns,
  conversations,
  memoryFacts,
  messages,
  researchClaims,
  researchSnapshots,
  researchSources,
  temporalComparisons,
  users,
} from "../db/schema.js";
import { AppError } from "../utils/errors.js";

const MAX_EXPORT_MESSAGES = 5_000;
const MAX_EXPORT_FACTS = 2_000;

export class DataExportService {
  constructor(private readonly db: AppDatabase) {}

  async exportUserData(userId: string) {
    const user = (await this.db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) {
      throw new AppError("User not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    const conversationRows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId));

    const conversationIds = conversationRows.map((row) => row.id);
    const messageRows = [];
    for (const conversationId of conversationIds) {
      const page = await this.db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));
      messageRows.push(...page);
      if (messageRows.length > MAX_EXPORT_MESSAGES) break;
    }

    const facts = (await this.db
      .select({
        id: memoryFacts.id,
        fact: memoryFacts.fact,
        category: memoryFacts.category,
        memoryKey: memoryFacts.memoryKey,
        isActive: memoryFacts.isActive,
        createdAt: memoryFacts.createdAt,
      })
      .from(memoryFacts)
      .where(eq(memoryFacts.userId, userId)))
      .slice(0, MAX_EXPORT_FACTS);

    const snapshots = await this.db
      .select()
      .from(researchSnapshots)
      .where(eq(researchSnapshots.userId, userId));

    const snapshotIds = snapshots.map((snapshot) => snapshot.id);
    const sources =
      snapshotIds.length === 0
        ? []
        : await this.db
            .select({
              id: researchSources.id,
              snapshotId: researchSources.snapshotId,
              title: researchSources.title,
              url: researchSources.url,
              domain: researchSources.domain,
              retrievedAt: researchSources.retrievedAt,
            })
            .from(researchSources)
            .where(inArray(researchSources.snapshotId, snapshotIds));

    const claims = await this.db
      .select()
      .from(researchClaims)
      .where(eq(researchClaims.userId, userId));

    const comparisons = await this.db
      .select()
      .from(temporalComparisons)
      .where(eq(temporalComparisons.userId, userId));

    const runs = await this.db
      .select({
        id: agentRuns.id,
        conversationId: agentRuns.conversationId,
        status: agentRuns.status,
        createdAt: agentRuns.createdAt,
        completedAt: agentRuns.completedAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.userId, userId));

    return {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
      conversations: conversationRows,
      messages: messageRows.slice(0, MAX_EXPORT_MESSAGES),
      memoryFacts: facts,
      researchSnapshots: snapshots,
      researchSources: sources,
      researchClaims: claims,
      temporalComparisons: comparisons,
      agentRuns: runs,
      limits: {
        maxMessages: MAX_EXPORT_MESSAGES,
        maxFacts: MAX_EXPORT_FACTS,
        truncatedMessages: messageRows.length > MAX_EXPORT_MESSAGES,
        truncatedFacts: facts.length >= MAX_EXPORT_FACTS,
      },
    };
  }
}
