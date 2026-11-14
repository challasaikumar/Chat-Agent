import type { TavilySearchOptions, TavilySearchResponse } from "@tavily/core";
import type { Env } from "../../../config/env.js";
import type { SearchInput } from "../../search.types.js";
import type { RawProviderResponse } from "../../search.normalizer.js";
import { timeoutSecondsFromMs } from "../../search.utils.js";

/**
 * Map Minimi SearchInput → official SDK camelCase options.
 * Do not request includeAnswer — Minimi synthesizes answers later.
 */
export function toTavilySearchOptions(
  input: SearchInput,
  env: Env,
): TavilySearchOptions {
  const maxResults = Math.min(
    input.maxResults ?? env.SEARCH_DEFAULT_RESULTS,
    env.SEARCH_MAX_RESULTS,
  );

  let includeRawContent: TavilySearchOptions["includeRawContent"];
  if (input.includeRawContent === true) {
    includeRawContent = "text";
  } else if (input.includeRawContent === false) {
    includeRawContent = false;
  } else if (input.includeRawContent === "markdown" || input.includeRawContent === "text") {
    includeRawContent = input.includeRawContent;
  }

  return {
    searchDepth: input.searchDepth ?? env.SEARCH_DEFAULT_DEPTH,
    topic: input.topic,
    maxResults,
    timeRange: input.timeRange,
    startDate: input.startDate,
    endDate: input.endDate,
    includeDomains: input.includeDomains,
    excludeDomains: input.excludeDomains,
    country: input.country,
    ...(includeRawContent !== undefined ? { includeRawContent } : {}),
    includePublishedDate: true,
    includeFavicon: true,
    includeUsage: true,
    timeout: timeoutSecondsFromMs(env.SEARCH_TIMEOUT_MS),
  };
}

export function fromTavilyResponse(
  response: TavilySearchResponse,
): RawProviderResponse {
  return {
    query: response.query,
    provider: "tavily",
    requestId: response.requestId ?? null,
    // SDK documents responseTime in seconds; normalize to ms for our contract.
    responseTimeMs: Math.round((response.responseTime ?? 0) * 1000),
    results: (response.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      content: result.content,
      rawContent: result.rawContent,
      score: result.score,
      publishedDate: result.publishedDate,
      favicon: result.favicon,
    })),
    usage: response.usage
      ? { credits: response.usage.credits ?? null }
      : null,
  };
}
