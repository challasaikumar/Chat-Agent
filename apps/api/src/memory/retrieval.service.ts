import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type {
  Conversation,
  Entity,
  MemoryFact,
  Message,
  ResearchSnapshot,
  ResearchSource,
} from "../db/schema.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { EntityRepository } from "../repositories/entity.repository.js";
import { FactRepository } from "../repositories/fact.repository.js";
import { FtsRepository, type FtsHit } from "../repositories/fts.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { SummaryRepository } from "../repositories/summary.repository.js";
import { dateRangeBoundsUtc } from "../utils/timezone.js";
import { AppError } from "../utils/errors.js";

export type MemorySearchParams = {
  q?: string;
  date?: string;
  from?: string;
  to?: string;
  timeZone?: string;
  conversationId?: string;
  limit?: number;
};

export type MemorySearchResult = {
  messages: Array<Message & { excerpt?: string; rank?: number }>;
  conversations: Conversation[];
  summaries: Array<{
    conversationId: string;
    version: number;
    summary: string;
    coveredThroughMessageId: number;
  }>;
  entities: Entity[];
  facts: MemoryFact[];
  researchSnapshots: ResearchSnapshot[];
  researchSources: ResearchSource[];
  query: {
    q?: string;
    date?: string;
    from?: string;
    to?: string;
    timeZone: string;
    conversationId?: string;
    limit: number;
  };
};

export class RetrievalService {
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;
  private readonly fts: FtsRepository;
  private readonly entities: EntityRepository;
  private readonly facts: FactRepository;
  private readonly summaries: SummaryRepository;
  private readonly research: ResearchRepository;

  constructor(
    db: AppDatabase,
    private readonly env: Env,
  ) {
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.fts = new FtsRepository(db);
    this.entities = new EntityRepository(db);
    this.facts = new FactRepository(db);
    this.summaries = new SummaryRepository(db);
    this.research = new ResearchRepository(db);
  }

  async getConversation(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversations.findByIdForUser(conversationId, userId);
    if (!conversation) {
      throw new AppError("Conversation not found", {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }
    return conversation;
  }

  async search(userId: string, params: MemorySearchParams): Promise<MemorySearchResult> {
    const limit = Math.min(
      Math.max(params.limit ?? this.env.SEARCH_RESULT_LIMIT, 1),
      100,
    );
    const timeZone = params.timeZone ?? this.env.APP_TIME_ZONE;

    let start: Date | undefined;
    let end: Date | undefined;

    try {
      const bounds = dateRangeBoundsUtc({
        date: params.date,
        from: params.from,
        to: params.to,
        timeZone,
      });
      start = bounds.start;
      end = bounds.end;
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : "Invalid date or time zone",
        { statusCode: 400, code: "BAD_REQUEST" },
      );
    }

    if (params.conversationId) {
      await this.getConversation(params.conversationId, userId);
    }

    const ownedConversations = (await this.conversations.listForUser(userId, {
      limit: 500,
      includeArchived: true,
    })).items;
    const ownedIds = new Set(ownedConversations.map((c) => c.id));

    let ftsHits: FtsHit[] = [];
    if (params.q?.trim()) {
      ftsHits = (await this.fts.search({
        query: params.q,
        conversationId: params.conversationId,
        limit: limit * 3,
      })).filter((hit) => ownedIds.has(hit.conversationId));
    }

    let messageRows: Array<Message & { excerpt?: string; rank?: number }> = [];

    if (ftsHits.length > 0) {
      const hydrated = await Promise.all(
        ftsHits.map(async (hit) => {
          const message = await this.messages.findById(hit.messageId);
          if (!message) {
            return null;
          }
          if (start && message.createdAt < start) {
            return null;
          }
          if (end && message.createdAt > end) {
            return null;
          }
          return {
            ...message,
            excerpt: hit.excerpt,
            rank: hit.rank,
          };
        }),
      );
      messageRows = hydrated
        .filter((row): row is Message & { excerpt: string; rank: number } => row !== null)
        .slice(0, limit);
    } else if (start || end || params.conversationId) {
      const conversationIds = params.conversationId
        ? [params.conversationId]
        : [...ownedIds];

      messageRows = (await this.messages
        .listByDateRange({
          userConversationIds: conversationIds,
          start,
          end,
          limit,
        }))
        .map((message) => ({ ...message }));
    }

    const conversationIdSet = new Set(
      messageRows.map((m) => m.conversationId),
    );

    if (params.conversationId) {
      conversationIdSet.add(params.conversationId);
    }

    if (!params.q && (start || end)) {
      for (const conversation of await this.conversations.listByDateRange(userId, start, end)) {
        conversationIdSet.add(conversation.id);
      }
    }

    const conversations = [...conversationIdSet]
      .map((id) => ownedConversations.find((c) => c.id === id))
      .filter((c): c is Conversation => Boolean(c))
      .slice(0, limit);

    const summaries = (
      await Promise.all(
        conversations.map((conversation) =>
          this.summaries.getLatest(conversation.id),
        ),
      )
    )
      .filter((summary): summary is NonNullable<typeof summary> => Boolean(summary))
      .map((summary) => ({
        conversationId: summary.conversationId,
        version: summary.version,
        summary: summary.summary,
        coveredThroughMessageId: summary.coveredThroughMessageId,
      }));

    const entityQuery = params.q?.trim();
    const entities = entityQuery
      ? await this.entities.search({ q: entityQuery, limit })
      : params.conversationId
        ? (await this.entities.listForConversation(params.conversationId)).slice(0, limit)
        : [];

    const facts = (await this.facts.listForUser(userId, {
      limit,
      conversationId: params.conversationId,
      activeOnly: true,
    })).filter((fact) => {
      if (!entityQuery) {
        return true;
      }
      return fact.fact.toLowerCase().includes(entityQuery.toLowerCase())
        || fact.evidenceExcerpt.toLowerCase().includes(entityQuery.toLowerCase());
    });

    const researchSnapshots = (await this.research.listSnapshotsForUser(userId, {
      conversationId: params.conversationId,
      limit,
    })).items;
    const researchSources = await this.research.listSourcesForUser(userId, {
      conversationId: params.conversationId,
      limit,
    });

    return {
      messages: messageRows,
      conversations,
      summaries,
      entities,
      facts,
      researchSnapshots,
      researchSources,
      query: {
        q: params.q,
        date: params.date,
        from: params.from,
        to: params.to,
        timeZone,
        conversationId: params.conversationId,
        limit,
      },
    };
  }
}
