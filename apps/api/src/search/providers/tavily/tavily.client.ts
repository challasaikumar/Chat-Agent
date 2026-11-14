import { tavily, type TavilyClient } from "@tavily/core";
import type { Env } from "../../../config/env.js";
import { hasTavilyKey } from "../../../config/env.js";
import { searchConfigurationError } from "../../search.interface.js";

let cachedClient: TavilyClient | null = null;
let cachedKey: string | null = null;

/**
 * Reuse a single Tavily client per process / API key.
 * Application startup must succeed without a key; callers must check first.
 */
export function getTavilyClient(env: Env): TavilyClient {
  if (!hasTavilyKey(env)) {
    throw searchConfigurationError();
  }

  const apiKey = env.TAVILY_API_KEY.trim();
  if (cachedClient && cachedKey === apiKey) {
    return cachedClient;
  }

  cachedClient = tavily({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

/** Test helper — clears the process-level client cache. */
export function resetTavilyClientCache(): void {
  cachedClient = null;
  cachedKey = null;
}
