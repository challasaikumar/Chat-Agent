import type { SearchInput, SearchResponse } from "./search.types.js";

export interface SearchProvider {
  readonly name: string;
  search(input: SearchInput): Promise<SearchResponse>;
}

export class SearchError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code: string;
      statusCode: number;
      details?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SearchError";
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export function searchConfigurationError(message = "TAVILY_API_KEY is not configured") {
  return new SearchError(message, {
    code: "SEARCH_CONFIGURATION_ERROR",
    statusCode: 503,
  });
}

export function searchValidationError(message: string, details?: unknown) {
  return new SearchError(message, {
    code: "SEARCH_VALIDATION_ERROR",
    statusCode: 400,
    details,
  });
}

export function searchAuthenticationError(message = "Search provider authentication failed") {
  return new SearchError(message, {
    code: "SEARCH_AUTHENTICATION_ERROR",
    statusCode: 401,
  });
}

export function searchRateLimitError(message = "Search provider rate limit exceeded") {
  return new SearchError(message, {
    code: "SEARCH_RATE_LIMIT_ERROR",
    statusCode: 429,
  });
}

export function searchTimeoutError(message = "Search provider request timed out") {
  return new SearchError(message, {
    code: "SEARCH_TIMEOUT_ERROR",
    statusCode: 504,
  });
}

export function searchProviderError(message: string, details?: unknown) {
  return new SearchError(message, {
    code: "SEARCH_PROVIDER_ERROR",
    statusCode: 502,
    details,
  });
}

export function searchEmptyResultsError(message = "Search returned no results") {
  return new SearchError(message, {
    code: "SEARCH_EMPTY_RESULTS",
    statusCode: 404,
  });
}

export function searchPersistenceError(message = "Failed to persist research results") {
  return new SearchError(message, {
    code: "SEARCH_PERSISTENCE_ERROR",
    statusCode: 500,
  });
}
