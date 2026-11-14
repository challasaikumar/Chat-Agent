import type { AppDatabase } from "../db/index.js";
import type { Conversation, Message, MessageRole } from "../db/schema.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { SummaryRepository } from "../repositories/summary.repository.js";
import { AppError } from "../utils/errors.js";
import type { PageResult } from "../utils/pagination.js";

export class ConversationService {
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;
  private readonly summaries: SummaryRepository;

  constructor(db: AppDatabase) {
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.summaries = new SummaryRepository(db);
  }

  async create(userId: string, title?: string): Promise<Conversation> {
    return this.conversations.create({ userId, title });
  }

  async list(
    userId: string,
    options: { limit: number; cursor?: string; includeArchived?: boolean },
  ): Promise<PageResult<Conversation>> {
    return this.conversations.listForUser(userId, options);
  }

  async get(userId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.conversations.findByIdForUser(conversationId, userId);
    if (!conversation) {
      throw new AppError("Conversation not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }
    return conversation;
  }

  async update(
    userId: string,
    conversationId: string,
    input: { title?: string; archived?: boolean },
  ): Promise<Conversation> {
    await this.get(userId, conversationId);

    const updated = await this.conversations.updateForUser(conversationId, userId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.archived === true
        ? { archivedAt: new Date() }
        : input.archived === false
          ? { archivedAt: null }
          : {}),
    });

    if (!updated) {
      throw new AppError("Conversation not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    return updated;
  }

  async delete(userId: string, conversationId: string): Promise<void> {
    const deleted = await this.conversations.deleteForUser(conversationId, userId);
    if (!deleted) {
      throw new AppError("Conversation not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }
  }

  async listMessages(
    userId: string,
    conversationId: string,
    options: { limit: number; cursor?: string },
  ): Promise<PageResult<Message>> {
    await this.get(userId, conversationId);
    return this.messages.listForConversation(conversationId, {
      ...options,
      order: "asc",
    });
  }

  async addMessage(
    userId: string,
    conversationId: string,
    input: {
      role: MessageRole;
      content: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<Message> {
    await this.get(userId, conversationId);

    if (!input.content.trim()) {
      throw new AppError("Message content is required", {
        statusCode: 400,
        code: "BAD_REQUEST",
      });
    }

    return this.messages.insert({
      conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? null,
    });
  }

  async getLatestSummary(userId: string, conversationId: string) {
    await this.get(userId, conversationId);
    return await this.summaries.getLatest(conversationId) ?? null;
  }
}
