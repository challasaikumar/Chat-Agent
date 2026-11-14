import {
  TavilyKeylessLimitError,
  TavilyRequestError,
} from "@tavily/core";
import {
  searchAuthenticationError,
  searchProviderError,
  searchRateLimitError,
  searchTimeoutError,
  SearchError,
} from "../../search.interface.js";
import { sanitizeSecret } from "../../search.utils.js";

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  const message =
    error instanceof Error ? error.message.toLowerCase() : "";

  return (
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT" ||
    code === "ERR_CANCELED" ||
    message.includes("timeout")
  );
}

export function translateTavilyError(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }

  if (isTimeoutError(error)) {
    return searchTimeoutError();
  }

  if (error instanceof TavilyKeylessLimitError) {
    if (error.status === 401 || error.capType === "api_key_required") {
      return searchAuthenticationError("Tavily API key is required");
    }
    if (error.status === 429) {
      return searchRateLimitError(
        sanitizeSecret(error.message || "Tavily rate limit exceeded"),
      );
    }
    return searchProviderError(sanitizeSecret(error.message), {
      status: error.status,
      capType: error.capType,
    });
  }

  if (error instanceof TavilyRequestError) {
    if (error.status === 401 || error.status === 403) {
      return searchAuthenticationError(
        sanitizeSecret(error.message || "Tavily authentication failed"),
      );
    }
    if (error.status === 429) {
      return searchRateLimitError(
        sanitizeSecret(error.message || "Tavily rate limit exceeded"),
      );
    }
    if (error.status === 408 || error.status === 504) {
      return searchTimeoutError();
    }
    return searchProviderError(
      sanitizeSecret(error.message || "Tavily request failed"),
      { status: error.status },
    );
  }

  if (error instanceof Error) {
    if (isTimeoutError(error)) {
      return searchTimeoutError();
    }
    return searchProviderError(sanitizeSecret(error.message), {
      name: error.name,
    });
  }

  return searchProviderError("Unknown Tavily provider error");
}
