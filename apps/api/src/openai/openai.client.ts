import OpenAI from "openai";
import type { Env } from "../config/env.js";
import { hasOpenAiKey, resolveLlmProvider } from "../config/env.js";

let cached: { cacheKey: string; client: OpenAI } | null = null;

/**
 * Shared OpenAI-compatible client (OpenAI, OpenRouter free models, etc.).
 * Reuses one client per process / credential set.
 */
export function getOpenAiClient(env: Env): OpenAI {
  if (!hasOpenAiKey(env)) {
    throw new Error(
      "No LLM API key configured. Set OPENROUTER_API_KEY (free) or OPENAI_API_KEY.",
    );
  }

  const provider = resolveLlmProvider(env);
  const cacheKey = `${provider.baseURL ?? "openai"}|${provider.apiKey}`;
  if (cached && cached.cacheKey === cacheKey) {
    return cached.client;
  }

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    timeout: env.AGENT_REQUEST_TIMEOUT_MS,
    maxRetries: env.OPENAI_MAX_RETRIES,
    defaultHeaders: provider.defaultHeaders,
  });

  cached = { cacheKey, client };
  return client;
}

export function resetOpenAiClientCache(): void {
  cached = null;
}

export function tryGetOpenAiClient(env: Env): OpenAI | null {
  if (!hasOpenAiKey(env)) {
    return null;
  }
  return getOpenAiClient(env);
}
