import { sql } from "drizzle-orm";
import type { AppDatabase } from "../db/index.js";
import { FTS_CONFIG } from "../db/fts.js";
import { buildSnippet, sanitizeFtsQuery, toTsQuerySql } from "../utils/fts-query.js";

export type FtsHit = {
  messageId: number;
  conversationId: string;
  content: string;
  excerpt: string;
  /** Lower is better (negated ts_rank_cd) to preserve the previous bm25-style ordering contract. */
  rank: number;
};

type Row = {
  message_id: number | string;
  conversation_id: string;
  content: string;
  rank: number | string;
};

/** Postgres full-text search over `messages.search_vector` (GIN indexed). */
export class FtsRepository {
  constructor(private readonly db: AppDatabase) {}

  async search(options: {
    query: string;
    conversationId?: string;
    limit: number;
  }): Promise<FtsHit[]> {
    const match = sanitizeFtsQuery(options.query);
    if (!match) {
      return [];
    }

    const limit = Math.min(Math.max(options.limit, 1), 100);
    const tsQuery = toTsQuerySql(match, FTS_CONFIG);
    const conversationFilter = options.conversationId
      ? sql`AND m.conversation_id = ${options.conversationId}`
      : sql``;

    const rows = (await this.db.execute(sql`
      SELECT
        m.id AS message_id,
        m.conversation_id AS conversation_id,
        m.content AS content,
        -ts_rank_cd(m.search_vector, ${tsQuery}) AS rank
      FROM messages m
      WHERE m.search_vector @@ ${tsQuery}
        ${conversationFilter}
      ORDER BY rank ASC, m.id ASC
      LIMIT ${limit}
    `)) as unknown as Row[];

    return rows.map((row) => ({
      messageId: Number(row.message_id),
      conversationId: row.conversation_id,
      content: row.content,
      excerpt: buildSnippet(row.content, match),
      rank: Number(row.rank),
    }));
  }
}
