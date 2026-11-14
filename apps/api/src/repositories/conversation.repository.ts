import { and, desc, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  conversationSummaries,
  conversations,
  type Conversation,
} from "../db/schema.js";
import {
  decodeCursor,
  encodeCursor,
  type PageResult,
} from "../utils/pagination.js";

export type CreateConversationInput = {
  userId: string;
  title?: string;
};

export type UpdateConversationInput = {
  title?: string;
  archivedAt?: Date | null;
};

type ConversationCursor = {
  updatedAt: number;
  id: string;
};

export class ConversationRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: CreateConversationInput): Promise<Conversation> {
    const now = new Date();
    const id = randomUUID();

    await this.db
      .insert(conversations)
      .values({
        id,
        userId: input.userId,
        title: input.title?.trim() || "New conversation",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
        archivedAt: null,
      });

    const row = await this.findByIdForUser(id, input.userId);
    if (!row) {
      throw new Error("Failed to create conversation");
    }
    return row;
  }

  async findByIdForUser(id: string, userId: string): Promise<Conversation | undefined> {
    return (await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId))).limit(1))[0];
  }

  async listForUser(
    userId: string,
    options: { limit: number; cursor?: string; includeArchived?: boolean },
  ): Promise<PageResult<Conversation>> {
    const cursor = decodeCursor<ConversationCursor>(options.cursor);
    const conditions = [eq(conversations.userId, userId)];

    if (!options.includeArchived) {
      conditions.push(isNull(conversations.archivedAt));
    }

    if (cursor?.updatedAt && cursor.id) {
      conditions.push(
        or(
          lt(conversations.updatedAt, new Date(cursor.updatedAt)),
          and(
            eq(conversations.updatedAt, new Date(cursor.updatedAt)),
            lt(conversations.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
      .limit(options.limit + 1);

    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      limit: options.limit,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              updatedAt: last.updatedAt.getTime(),
              id: last.id,
            })
          : null,
    };
  }

  async updateForUser(
    id: string,
    userId: string,
    input: UpdateConversationInput,
  ): Promise<Conversation | undefined> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) {
      return undefined;
    }

    const now = new Date();
    await this.db
      .update(conversations)
      .set({
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
        updatedAt: now,
      })
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));

    return this.findByIdForUser(id, userId);
  }

  /**
   * Permanently delete a conversation owned by the user.
   * Summaries must go first because they RESTRICT on message ids.
   */
  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const existing = await this.findByIdForUser(id, userId);
    if (!existing) {
      return false;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(conversationSummaries)
        .where(eq(conversationSummaries.conversationId, id));
      await tx
        .delete(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    });

    return true;
  }

  async touchMessageActivity(
    conversationId: string,
    at: Date,
    executor: AppDatabase = this.db,
  ): Promise<void> {
    await executor
      .update(conversations)
      .set({
        lastMessageAt: at,
        updatedAt: at,
      })
      .where(eq(conversations.id, conversationId));
  }

  async listByDateRange(
    userId: string,
    start?: Date,
    end?: Date,
  ): Promise<Conversation[]> {
    const conditions = [eq(conversations.userId, userId)];

    if (start) {
      conditions.push(gte(conversations.lastMessageAt, start));
    }
    if (end) {
      conditions.push(lte(conversations.lastMessageAt, end));
    }

    return await this.db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(
        sql`${conversations.lastMessageAt} DESC NULLS LAST`,
        desc(conversations.id),
      );
  }
}
