import type { Env } from "../config/env.js";
import {
  contentHash,
  extractDomain,
  isHttpUrl,
  normalizeUrl,
  parsePublicationDate,
  truncateContent,
} from "./search.utils.js";
import type { SearchResult, SearchResponse, SearchUsage } from "./search.types.js";

export type RawProviderResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  rawContent?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  publishedAt?: unknown;
  favicon?: unknown;
  faviconUrl?: unknown;
};

export type RawProviderResponse = {
  query: string;
  provider: string;
  requestId?: string | null;
  responseTimeMs?: number;
  results: RawProviderResult[];
  usage?: { credits?: number | null } | null;
};

export function normalizeSearchResponse(
  raw: RawProviderResponse,
  options: { maxContentLength: number; retrievedAt?: Date },
): SearchResponse {
  const retrievedAt = (options.retrievedAt ?? new Date()).toISOString();
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const item of raw.results) {
    if (typeof item.url !== "string" || !isHttpUrl(item.url)) {
      continue;
    }

    const url = normalizeUrl(item.url);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);

    const domain = extractDomain(url);
    if (!domain) {
      continue;
    }

    const title =
      typeof item.title === "string" && item.title.trim()
        ? item.title.trim()
        : domain;

    const preferredContent =
      typeof item.content === "string" && item.content.trim()
        ? item.content
        : typeof item.rawContent === "string"
          ? item.rawContent
          : "";

    const content = truncateContent(preferredContent.trim(), options.maxContentLength);
    const publishedAt = parsePublicationDate(
      item.publishedAt ?? item.publishedDate,
    );

    const score =
      typeof item.score === "number" && Number.isFinite(item.score)
        ? item.score
        : null;

    const faviconCandidate =
      typeof item.faviconUrl === "string"
        ? item.faviconUrl
        : typeof item.favicon === "string"
          ? item.favicon
          : null;

    const faviconUrl =
      faviconCandidate && isHttpUrl(faviconCandidate)
        ? normalizeUrl(faviconCandidate)
        : null;

    results.push({
      title,
      url,
      domain,
      content,
      score,
      publishedAt,
      retrievedAt,
      faviconUrl,
      contentHash: contentHash({ url, title, content }),
    });
  }

  const usage: SearchUsage | null =
    raw.usage && typeof raw.usage === "object"
      ? {
          credits:
            typeof raw.usage.credits === "number" ? raw.usage.credits : null,
        }
      : null;

  return {
    query: raw.query,
    provider: raw.provider,
    requestId: raw.requestId ?? null,
    results,
    responseTimeMs:
      typeof raw.responseTimeMs === "number" && Number.isFinite(raw.responseTimeMs)
        ? Math.max(0, Math.round(raw.responseTimeMs))
        : 0,
    resultCount: results.length,
    usage,
  };
}

export function defaultMaxContentLength(env: Env): number {
  return env.SEARCH_MAX_CONTENT_LENGTH;
}
