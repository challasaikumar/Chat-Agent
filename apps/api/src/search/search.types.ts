export type SearchDepth = "basic" | "advanced" | "fast" | "ultra-fast";
export type SearchTopic = "general" | "news" | "finance";
export type SearchTimeRange = "day" | "week" | "month" | "year";
export type IncludeRawContent = boolean | "markdown" | "text";

export type SearchUsage = {
  credits: number | null;
};

export type SearchResult = {
  title: string;
  url: string;
  domain: string;
  content: string;
  score: number | null;
  publishedAt: string | null;
  retrievedAt: string;
  faviconUrl: string | null;
  contentHash: string;
};

export type SearchCacheInfo = {
  hit: boolean;
  insertedAt: string | null;
  servedAt: string | null;
  ageMs: number | null;
  volatility: "high" | "moderate" | "stable" | null;
  bypassed: boolean;
  bypassReason?: string;
};

export type SearchResponse = {
  query: string;
  provider: string;
  requestId: string | null;
  results: SearchResult[];
  responseTimeMs: number;
  resultCount: number;
  usage: SearchUsage | null;
  /** Present when served via performance search cache. Original result.retrievedAt is preserved. */
  cache?: SearchCacheInfo;
};

export type SearchInput = {
  query: string;
  searchDepth?: SearchDepth;
  topic?: SearchTopic;
  maxResults?: number;
  timeRange?: SearchTimeRange;
  startDate?: string;
  endDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
  includeRawContent?: IncludeRawContent;
};
