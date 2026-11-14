import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppDatabase } from "../db/index.js";
import {
  researchSnapshots,
  researchSources,
  type ResearchSnapshot,
  type ResearchSource,
} from "../db/schema.js";
import {
  decodeCursor,
  encodeCursor,
  type PageResult,
} from "../utils/pagination.js";
import type { SearchInput, SearchResult, SearchResponse } from "../search/search.types.js";

export type CreateSnapshotInput = {
  userId: string;
  conversationId: string;
  query: string;
  title: string;
  provider: string;
  providerRequestId: string | null;
  searchParameters: SearchInput;
  responseTimeMs: number;
  resultCount: number;
  capturedAt?: Date;
  sources: SearchResult[];
};

type SnapshotCursor = {
  capturedAt: number;
  id: string;
};

export class ResearchRepository {
  constructor(private readonly db: AppDatabase) {}

  async createSnapshotWithSources(input: CreateSnapshotInput): Promise<{
    snapshot: ResearchSnapshot;
    sources: ResearchSource[];
  }> {
    const capturedAt = input.capturedAt ?? new Date();
    const snapshotId = randomUUID();

    return this.db.transaction(async (tx: AppDatabase) => {
      await tx.insert(researchSnapshots)
        .values({
          id: snapshotId,
          userId: input.userId,
          conversationId: input.conversationId,
          query: input.query,
          title: input.title,
          provider: input.provider,
          providerRequestId: input.providerRequestId,
          searchParameters: input.searchParameters as Record<string, unknown>,
          capturedAt,
          responseTimeMs: input.responseTimeMs,
          resultCount: input.resultCount,
          createdAt: capturedAt,
        });

      const sources: ResearchSource[] = [];

      for (const result of input.sources) {
        const sourceId = randomUUID();
        const publishedAt = result.publishedAt
          ? new Date(result.publishedAt)
          : null;

        await tx.insert(researchSources)
          .values({
            id: sourceId,
            snapshotId,
            title: result.title,
            url: result.url,
            domain: result.domain,
            contentExcerpt: result.content,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            retrievedAt: new Date(result.retrievedAt),
            contentHash: result.contentHash,
            relevanceScore: result.score,
            faviconUrl: result.faviconUrl,
          });

        const row = (await tx
          .select()
          .from(researchSources)
          .where(eq(researchSources.id, sourceId)).limit(1))[0];

        if (row) {
          sources.push(row);
        }
      }

      const snapshot = (await tx
        .select()
        .from(researchSnapshots)
        .where(eq(researchSnapshots.id, snapshotId)).limit(1))[0];

      if (!snapshot) {
        throw new Error("Failed to create research snapshot");
      }

      return { snapshot, sources };
    });
  }

  async findSnapshotForUser(
    snapshotId: string,
    userId: string,
  ): Promise<ResearchSnapshot | undefined> {
    return (await this.db
      .select()
      .from(researchSnapshots)
      .where(
        and(
          eq(researchSnapshots.id, snapshotId),
          eq(researchSnapshots.userId, userId),
        ),
      ).limit(1))[0];
  }

  async listSnapshotsForUser(
    userId: string,
    options: {
      conversationId?: string;
      limit: number;
      cursor?: string;
    },
  ): Promise<PageResult<ResearchSnapshot>> {
    const cursor = decodeCursor<SnapshotCursor>(options.cursor);
    const conditions = [eq(researchSnapshots.userId, userId)];

    if (options.conversationId) {
      conditions.push(eq(researchSnapshots.conversationId, options.conversationId));
    }

    if (cursor?.capturedAt && cursor.id) {
      conditions.push(
        or(
          lt(researchSnapshots.capturedAt, new Date(cursor.capturedAt)),
          and(
            eq(researchSnapshots.capturedAt, new Date(cursor.capturedAt)),
            lt(researchSnapshots.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(researchSnapshots)
      .where(and(...conditions))
      .orderBy(desc(researchSnapshots.capturedAt), desc(researchSnapshots.id))
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
              capturedAt: last.capturedAt.getTime(),
              id: last.id,
            })
          : null,
    };
  }

  async listSourcesForSnapshot(snapshotId: string): Promise<ResearchSource[]> {
    return await this.db
      .select()
      .from(researchSources)
      .where(eq(researchSources.snapshotId, snapshotId))
      .orderBy(
        sql`${researchSources.relevanceScore} DESC NULLS LAST`,
        desc(researchSources.retrievedAt),
      );
  }

  async listSourcesForUser(
    userId: string,
    options: { limit: number; conversationId?: string },
  ): Promise<Array<ResearchSource & { snapshotId: string; query: string }>> {
    const snapshots = (await this.listSnapshotsForUser(userId, {
      conversationId: options.conversationId,
      limit: options.limit,
    })).items;

    const results: Array<ResearchSource & { snapshotId: string; query: string }> =
      [];

    for (const snapshot of snapshots) {
      const sources = await this.listSourcesForSnapshot(snapshot.id);
      for (const source of sources) {
        results.push({
          ...source,
          snapshotId: snapshot.id,
          query: snapshot.query,
        });
        if (results.length >= options.limit) {
          return results;
        }
      }
    }

    return results;
  }

  /** Used by retrieval service — keep Phase 02 signature compatibility. */
  async listSnapshotsSimple(
    userId: string,
    options: { conversationId?: string; limit: number },
  ): Promise<ResearchSnapshot[]> {
    return (await this.listSnapshotsForUser(userId, options)).items;
  }
}

export function snapshotTitleFromQuery(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 120) {
    return trimmed;
  }
  return `${trimmed.slice(0, 117)}…`;
}

export function searchResponseToPersistable(
  response: SearchResponse,
): Pick<
  CreateSnapshotInput,
  "provider" | "providerRequestId" | "responseTimeMs" | "resultCount" | "sources"
> {
  return {
    provider: response.provider,
    providerRequestId: response.requestId,
    responseTimeMs: response.responseTimeMs,
    resultCount: response.resultCount,
    sources: response.results,
  };
}
