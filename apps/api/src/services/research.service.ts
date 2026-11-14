import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type {
  ResearchSnapshot,
  ResearchSource,
} from "../db/schema.js";
import {
  ResearchRepository,
  snapshotTitleFromQuery,
} from "../repositories/research.repository.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import {
  SearchError,
  searchEmptyResultsError,
  searchPersistenceError,
  searchValidationError,
  type SearchProvider,
} from "../search/search.interface.js";
import { researchSearchBodySchema } from "../search/search.schemas.js";
import { SearchService } from "../search/search.service.js";
import type { SearchResponse, SearchResult } from "../search/search.types.js";
import { AppError, notFound } from "../utils/errors.js";
import type { PageResult } from "../utils/pagination.js";

export type ResearchSearchContext = {
  userId: string;
  requestId?: string;
  logger?: FastifyBaseLogger;
  /** Bypass search cache for strict current-information verification. */
  forceRefresh?: boolean;
  signal?: AbortSignal;
};

export type ResearchSearchResult = {
  snapshot: ResearchSnapshot;
  results: SearchResult[];
  sources: ResearchSource[];
  meta: {
    provider: string;
    resultCount: number;
    responseTimeMs: number;
    requestId: string | null;
    usage: SearchResponse["usage"];
    cache: SearchResponse["cache"];
  };
};

export class ResearchService {
  private readonly search: SearchService;
  private readonly research: ResearchRepository;
  private readonly conversations: ConversationRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly env: Env,
    provider?: SearchProvider,
  ) {
    this.search = new SearchService(env, provider);
    this.research = new ResearchRepository(db);
    this.conversations = new ConversationRepository(db);
  }

  async searchAndSave(
    rawBody: unknown,
    context: ResearchSearchContext,
  ): Promise<ResearchSearchResult> {
    const parsed = researchSearchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw searchValidationError(
        "Invalid research search request",
        parsed.error.flatten(),
      );
    }

    const { conversationId, ...searchInput } = parsed.data;
    const conversation = await this.conversations.findByIdForUser(
      conversationId,
      context.userId,
    );
    if (!conversation) {
      throw notFound("Conversation not found");
    }

    const log = context.logger;
    const startedAt = Date.now();

    log?.info(
      {
        requestId: context.requestId,
        conversationId,
        queryLength: searchInput.query.length,
        provider: this.search.getProviderName(),
      },
      "Search started",
    );

    let response: SearchResponse;
    try {
      response = await this.search.search(searchInput, {
        forceRefresh: context.forceRefresh,
        signal: context.signal,
      });
    } catch (error) {
      log?.error(
        {
          requestId: context.requestId,
          conversationId,
          err: sanitizeLogError(error),
          durationMs: Date.now() - startedAt,
        },
        "Search failed",
      );
      throw error;
    }

    log?.info(
      {
        requestId: context.requestId,
        providerRequestId: response.requestId,
        conversationId,
        resultCount: response.resultCount,
        providerLatencyMs: response.responseTimeMs,
        durationMs: Date.now() - startedAt,
        cacheHit: response.cache?.hit ?? false,
        cacheAgeMs: response.cache?.ageMs ?? null,
        // Original evidence retrieval times remain on each result.retrievedAt
        cacheServedAt: response.cache?.servedAt ?? null,
      },
      "Search completed",
    );

    if (response.results.length === 0) {
      throw searchEmptyResultsError();
    }

    const persistStarted = Date.now();
    try {
      const persisted = await this.research.createSnapshotWithSources({
        userId: context.userId,
        conversationId,
        query: searchInput.query,
        title: snapshotTitleFromQuery(searchInput.query),
        provider: response.provider,
        providerRequestId: response.requestId,
        searchParameters: {
          query: searchInput.query,
          searchDepth: searchInput.searchDepth,
          topic: searchInput.topic,
          maxResults: searchInput.maxResults,
          timeRange: searchInput.timeRange,
          startDate: searchInput.startDate,
          endDate: searchInput.endDate,
          includeDomains: searchInput.includeDomains,
          excludeDomains: searchInput.excludeDomains,
          country: searchInput.country,
          includeRawContent: searchInput.includeRawContent,
        },
        responseTimeMs: response.responseTimeMs,
        resultCount: response.resultCount,
        sources: response.results,
      });

      log?.info(
        {
          requestId: context.requestId,
          snapshotId: persisted.snapshot.id,
          sourceCount: persisted.sources.length,
          persistenceDurationMs: Date.now() - persistStarted,
        },
        "Research persistence completed",
      );

      return {
        snapshot: persisted.snapshot,
        results: response.results,
        sources: persisted.sources,
        meta: {
          provider: response.provider,
          resultCount: response.resultCount,
          responseTimeMs: response.responseTimeMs,
          requestId: response.requestId,
          usage: response.usage,
          cache: response.cache,
        },
      };
    } catch (error) {
      log?.error(
        {
          requestId: context.requestId,
          conversationId,
          err: sanitizeLogError(error),
          persistenceDurationMs: Date.now() - persistStarted,
        },
        "Research persistence failed",
      );

      if (error instanceof SearchError || error instanceof AppError) {
        throw error;
      }

      throw searchPersistenceError();
    }
  }

  async getSnapshot(snapshotId: string, userId: string): Promise<ResearchSnapshot> {
    const snapshot = await this.research.findSnapshotForUser(snapshotId, userId);
    if (!snapshot) {
      throw notFound("Research snapshot not found");
    }
    return snapshot;
  }

  async listSnapshots(
    userId: string,
    filters: { conversationId?: string; limit: number; cursor?: string },
  ): Promise<PageResult<ResearchSnapshot>> {
    return this.research.listSnapshotsForUser(userId, filters);
  }

  async getSources(snapshotId: string, userId: string): Promise<ResearchSource[]> {
    await this.getSnapshot(snapshotId, userId);
    return this.research.listSourcesForSnapshot(snapshotId);
  }
}

function sanitizeLogError(error: unknown): Record<string, unknown> {
  if (error instanceof SearchError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
    };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return { message: "Unknown error" };
}
