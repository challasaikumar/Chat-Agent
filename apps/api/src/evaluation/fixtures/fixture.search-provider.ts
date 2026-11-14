import { createHash } from "node:crypto";
import type { SearchProvider } from "../../search/search.interface.js";
import type { SearchInput, SearchResponse, SearchResult } from "../../search/search.types.js";
import type { EvaluationCase } from "../evaluation.schemas.js";
import type { Clock } from "./fixture.clock.js";
import { SystemClock } from "./fixture.clock.js";

export type FixtureSearchCall = {
  query: string;
  at: string;
};

export type FixtureSearchProvider = SearchProvider & {
  readonly calls: FixtureSearchCall[];
  readonly callCount: number;
};

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function matchFixture(
  query: string,
  fixtures: EvaluationCase["searchFixtures"],
): EvaluationCase["searchFixtures"][number] | undefined {
  const exact = fixtures.find(
    (f) => f.queryEquals && f.queryEquals.toLowerCase() === query.toLowerCase(),
  );
  if (exact) return exact;
  return fixtures.find(
    (f) =>
      f.queryContains &&
      query.toLowerCase().includes(f.queryContains.toLowerCase()),
  );
}

/**
 * Deterministic Tavily stand-in. Matches fixtures by queryContains / queryEquals.
 * Falls back to empty results (does not invent market data).
 */
export function createFixtureSearchProvider(
  fixtures: EvaluationCase["searchFixtures"] = [],
  options: { clock?: Clock; unavailable?: boolean } = {},
): FixtureSearchProvider {
  const clock = options.clock ?? new SystemClock();
  const calls: FixtureSearchCall[] = [];

  const provider: FixtureSearchProvider = {
    name: "tavily",
    get calls() {
      return [...calls];
    },
    get callCount() {
      return calls.length;
    },
    async search(input: SearchInput): Promise<SearchResponse> {
      const retrievedAt = clock.now().toISOString();
      calls.push({ query: input.query, at: retrievedAt });

      if (options.unavailable) {
        throw new Error("SEARCH_PROVIDER_UNAVAILABLE");
      }

      const fixture = matchFixture(input.query, fixtures);
      const results: SearchResult[] = (fixture?.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        domain: r.domain,
        content: r.content,
        score: r.score ?? 0.8,
        publishedAt: r.publishedAt ?? null,
        retrievedAt,
        faviconUrl: null,
        contentHash: r.contentHash ?? hashContent(r.content),
      }));

      return {
        query: input.query,
        provider: "tavily",
        requestId: `tvly-fixture-${calls.length}`,
        responseTimeMs: 12,
        resultCount: results.length,
        usage: { credits: results.length > 0 ? 1 : 0 },
        results,
      };
    },
  };

  return provider;
}
