import { and, asc, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import {
  messages,
  type Message,
  type MessageRole,
} from "../db/schema.js";
import {
  decodeCursor,
  encodeCursor,
  type PageResult,
} from "../utils/pagination.js";
import { ConversationRepository } from "./conversation.repository.js";

export type InsertMessageInput = {
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
};

type MessageCursor = { id: number };

export class MessageRepository {
  private readonly conversations: ConversationRepository;

  constructor(private readonly db: AppDatabase) {
    this.conversations = new ConversationRepository(db);
  }

  async insert(input: InsertMessageInput): Promise<Message> {
    return this.db.transaction(async (tx: AppDatabase) => {
      const createdAt = input.createdAt ?? new Date();

      const result = (await tx
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? null,
          createdAt,
        })
        .returning())[0]!;

      await this.conversations.touchMessageActivity(input.conversationId, createdAt, tx);

      return result;
    });
  }

  async insertMany(inputs: InsertMessageInput[]): Promise<Message[]> {
    if (inputs.length === 0) {
      return [];
    }

    return this.db.transaction(async (tx: AppDatabase) => {
      const created: Message[] = [];
      let lastAt = new Date(0);
      let conversationId = inputs[0]!.conversationId;

      for (const input of inputs) {
        conversationId = input.conversationId;
        const createdAt = input.createdAt ?? new Date();
        const row = (await tx
          .insert(messages)
          .values({
            conversationId: input.conversationId,
            role: input.role,
            content: input.content,
            metadata: input.metadata ?? null,
            createdAt,
          })
          .returning())[0]!;
        created.push(row);
        if (createdAt > lastAt) {
          lastAt = createdAt;
        }
      }

      await this.conversations.touchMessageActivity(conversationId, lastAt, tx);
      return created;
    });
  }

  async findById(id: number): Promise<Message | undefined> {
    return (await this.db.select().from(messages).where(eq(messages.id, id)).limit(1))[0];
  }

  async listForConversation(
    conversationId: string,
    options: { limit: number; cursor?: string; order?: "asc" | "desc" },
  ): Promise<PageResult<Message>> {
    const order = options.order ?? "asc";
    const cursor = decodeCursor<MessageCursor>(options.cursor);
    const conditions = [eq(messages.conversationId, conversationId)];

    if (cursor?.id !== undefined) {
      if (order === "asc") {
        conditions.push(gt(messages.id, cursor.id));
      } else {
        conditions.push(sql`${messages.id} < ${cursor.id}`);
      }
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(order === "asc" ? asc(messages.id) : desc(messages.id))
      .limit(options.limit + 1);

    const hasMore = rows.length > options.limit;
    const items = hasMore ? rows.slice(0, options.limit) : rows;
    const last = items[items.length - 1];

    return {
      items,
      limit: options.limit,
      nextCursor:
        hasMore && last
          ? encodeCursor({ id: last.id })
          : null,
    };
  }

  async listAfterId(conversationId: string, afterId: number | null): Promise<Message[]> {
    const conditions = [eq(messages.conversationId, conversationId)];
    if (afterId !== null) {
      conditions.push(gt(messages.id, afterId));
    }

    return await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.id));
  }

  async listByDateRange(options: {
    userConversationIds: string[];
    start?: Date;
    end?: Date;
    limit: number;
  }): Promise<Message[]> {
    if (options.userConversationIds.length === 0) {
      return [];
    }

    const conditions = [
      inArray(messages.conversationId, options.userConversationIds),
    ];

    if (options.start) {
      conditions.push(gte(messages.createdAt, options.start));
    }
    if (options.end) {
      conditions.push(lte(messages.createdAt, options.end));
    }

    return await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(asc(messages.createdAt), asc(messages.id))
      .limit(options.limit);
  }

  async updateContent(id: number, content: string): Promise<Message | undefined> {
    await this.db
      .update(messages)
      .set({ content })
      .where(eq(messages.id, id));
    return this.findById(id);
  }

  async deleteById(id: number): Promise<void> {
    await this.db.delete(messages).where(eq(messages.id, id));
  }

  async maxIdForConversation(conversationId: string): Promise<number | null> {
    const row = (await this.db
      .select({ maxId: sql<number | null>`max(${messages.id})` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId)).limit(1))[0];
    return row?.maxId ?? null;
  }
}
