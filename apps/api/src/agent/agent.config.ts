import type { Env } from "../config/env.js";
import { resolveLlmProvider } from "../config/env.js";

export type AgentConfig = {
  model: string;
  maxToolIterations: number;
  maxSearchesPerTurn: number;
  maxRecentMessages: number;
  maxContextChars: number;
  maxMemoryFacts: number;
  maxResearchSnapshots: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  memoryProcessEnabled: boolean;
  memoryProcessAfterMessages: number;
  defaultTimeZone: string;
  maxSearchResultsPerCall: number;
  maxToolContentChars: number;
};

export function loadAgentConfig(env: Env): AgentConfig {
  return {
    model: resolveLlmProvider(env).model,
    maxToolIterations: env.AGENT_MAX_TOOL_ITERATIONS,
    maxSearchesPerTurn: env.AGENT_MAX_SEARCHES_PER_TURN,
    maxRecentMessages: env.AGENT_MAX_RECENT_MESSAGES,
    maxContextChars: env.AGENT_MAX_CONTEXT_CHARS,
    maxMemoryFacts: env.AGENT_MAX_MEMORY_FACTS,
    maxResearchSnapshots: env.AGENT_MAX_RESEARCH_SNAPSHOTS,
    maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
    requestTimeoutMs: env.AGENT_REQUEST_TIMEOUT_MS,
    memoryProcessEnabled: env.AGENT_MEMORY_PROCESS_ENABLED,
    memoryProcessAfterMessages: env.AGENT_MEMORY_PROCESS_AFTER_MESSAGES,
    defaultTimeZone: env.APP_TIME_ZONE,
    maxSearchResultsPerCall: Math.min(8, env.MAX_SEARCH_RESULTS),
    maxToolContentChars: Math.min(2000, env.SEARCH_MAX_CONTENT_LENGTH),
  };
}
