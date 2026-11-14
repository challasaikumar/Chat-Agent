import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const envPath = resolve(rootDir, ".env");

loadEnv({ path: envPath });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  /** Bind address. Use 127.0.0.1 behind Nginx; 0.0.0.0 for local Docker-style access. */
  API_HOST: z.string().min(1).default("0.0.0.0"),
  /**
   * Postgres connection string (Supabase Dashboard → Project Settings → Database → URI).
   * Long-running Fastify: Session pooler / direct (port 5432). Transaction pooler (6543) also works
   * (prepared statements are disabled automatically).
   */
  DATABASE_URL: z.string().optional().default(""),
  /** Separate Postgres for Vitest — never point at production data. */
  DATABASE_URL_TEST: z.string().optional().default(""),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** @deprecated SQLite is no longer supported; ignored. Use DATABASE_URL. */
  DATABASE_PATH: z.string().optional(),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_ANON_KEY: z.string().optional().default(""),
  SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(""),
  /** Server-only. Never expose to the browser. Optional (admin/storage later). */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  /**
   * Prefer OpenRouter for free agent models (tool calling + streaming).
   * Free signup: https://openrouter.ai/keys — then set OPENROUTER_API_KEY.
   */
  OPENROUTER_API_KEY: z.string().optional().default(""),
  /** Override API host. Default OpenAI, or OpenRouter when OPENROUTER_API_KEY is set. */
  OPENAI_BASE_URL: z.string().optional().default(""),
  /**
   * Model id. Free default via OpenRouter: openrouter/free
   * (auto-picks a free model with tool calling). Paid OpenAI example: gpt-4.1-mini
   */
  OPENAI_MODEL: z.string().optional().default("openrouter/free"),
  /**
   * Strict JSON schema on Responses API. Auto-disabled for OpenRouter/free hosts
   * unless explicitly set to true.
   */
  OPENAI_STRUCTURED_OUTPUT: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return value === true || value === "true";
    }),
  OPENAI_HTTP_REFERER: z.string().optional().default("http://localhost:5173"),
  OPENAI_APP_TITLE: z.string().optional().default("Minimi Research Agent"),
  TAVILY_API_KEY: z.string().optional().default(""),
  MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(5),
  MAX_SEARCH_RESULTS: z.coerce.number().int().positive().default(8),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  LOCAL_USER_ID: z.string().min(1).default("local-dev-user"),
  APP_TIME_ZONE: z.string().min(1).default("Asia/Kolkata"),
  MEMORY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(100),
  SEARCH_RESULT_LIMIT: z.coerce.number().int().positive().default(25),
  OPENAI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(2),
  SEARCH_DEFAULT_DEPTH: z
    .enum(["basic", "advanced", "fast", "ultra-fast"])
    .default("basic"),
  SEARCH_DEFAULT_RESULTS: z.coerce.number().int().min(1).max(20).default(8),
  SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(20).default(20),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  SEARCH_MAX_CONTENT_LENGTH: z.coerce.number().int().positive().default(12_000),
  AGENT_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().default(3),
  AGENT_MAX_SEARCHES_PER_TURN: z.coerce.number().int().positive().default(2),
  AGENT_MAX_RECENT_MESSAGES: z.coerce.number().int().positive().default(12),
  AGENT_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(24_000),
  AGENT_MAX_MEMORY_FACTS: z.coerce.number().int().positive().default(20),
  AGENT_MAX_RESEARCH_SNAPSHOTS: z.coerce.number().int().positive().default(8),
  AGENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1800),
  // Free/OpenRouter models can be slow; keep headroom above a single LLM round-trip.
  AGENT_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  AGENT_MEMORY_PROCESS_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  AGENT_MEMORY_PROCESS_AFTER_MESSAGES: z.coerce
    .number()
    .int()
    .positive()
    .default(8),
  TEMPORAL_COMPARISON_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  TEMPORAL_MAX_HISTORICAL_SNAPSHOTS: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  TEMPORAL_MAX_CLAIMS_PER_COMPARISON: z.coerce
    .number()
    .int()
    .positive()
    .default(100),
  TEMPORAL_MIN_EXTRACTION_CONFIDENCE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.6),
  TEMPORAL_MAX_SOURCE_AGE_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(365),
  MEMORY_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  MEMORY_MAX_FACTS_PER_EXTRACTION: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  MEMORY_MAX_RETRIEVAL_RESULTS: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  MEMORY_MAX_CONTEXT_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(12_000),
  MEMORY_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.65),
  MEMORY_MIN_IMPORTANCE: z.coerce.number().min(0).max(1).default(0.2),
  MEMORY_PREFERENCE_CONFIRMATION_THRESHOLD: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  MEMORY_MAX_EXTRACTION_CONCURRENCY: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  MEMORY_CONSOLIDATION_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  MEMORY_DECAY_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  EVIDENCE_VERIFICATION_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  EVIDENCE_MAX_SOURCES_PER_CLAIM: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  EVIDENCE_MAX_CLAIMS_PER_RUN: z.coerce
    .number()
    .int()
    .positive()
    .default(100),
  EVIDENCE_MAX_CONTENT_LENGTH: z.coerce
    .number()
    .int()
    .positive()
    .default(12_000),
  EVIDENCE_MIN_DIRECTNESS: z.coerce.number().min(0).max(1).default(0.5),
  EVIDENCE_MIN_CORROBORATION_SOURCES: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  EVIDENCE_MAX_VERIFICATION_TIME_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30_000),
  EVIDENCE_CACHE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  EVIDENCE_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
  AGENT_STREAM_HEARTBEAT_MS: z.coerce.number().int().positive().default(15_000),
  AGENT_STREAM_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  AGENT_STREAM_MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(240_000),
  EVAL_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  EVAL_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  EVAL_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  EVAL_LIVE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return false;
      }
      return value === true || value === "true";
    }),
  EVAL_LLM_JUDGE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return false;
      }
      return value === true || value === "true";
    }),
  EVAL_LLM_JUDGE_MODEL: z.string().optional().default(""),
  EVAL_LLM_JUDGE_MAX_CASES: z.coerce.number().int().positive().default(20),
  EVAL_LLM_JUDGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  EVAL_REPORT_DIRECTORY: z.string().default("reports/evaluations"),
  PERF_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  PERF_MAX_ACTIVE_AGENT_RUNS: z.coerce.number().int().positive().default(10),
  PERF_MAX_ACTIVE_SEARCHES: z.coerce.number().int().positive().default(5),
  PERF_MAX_ACTIVE_OPENAI_REQUESTS: z.coerce.number().int().positive().default(5),
  PERF_CACHE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  PERF_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(500),
  PERF_SEARCH_CACHE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return true;
      }
      return value === true || value === "true";
    }),
  PERF_CONTEXT_CACHE_ENABLED: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return false;
      }
      return value === true || value === "true";
    }),
  PERF_DEFAULT_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90_000),
  PERF_MAX_STREAM_DURATION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000),
  PERF_DB_QUERY_WARNING_MS: z.coerce.number().int().positive().default(250),
  PERF_METRICS_SAMPLE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10_000),
  PERF_SEARCH_CACHE_TTL_HIGH_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  PERF_SEARCH_CACHE_TTL_MODERATE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(900_000),
  PERF_SEARCH_CACHE_TTL_STABLE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000),
  AUTH_MODE: z.enum(["session", "local_dev"]).default("local_dev"),
  AUTH_REGISTRATION_MODE: z
    .enum(["disabled", "invite_only"])
    .default("disabled"),
  AUTH_SESSION_IDLE_TIMEOUT_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  AUTH_SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .default(168),
  AUTH_COOKIE_NAME: z.string().min(1).default("minimi_session"),
  AUTH_CSRF_HEADER: z.string().min(1).default("x-csrf-token"),
  AUTH_BOOTSTRAP_ADMIN_EMAIL: z.string().optional().default(""),
  AUTH_BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(""),
  APP_ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  AUTH_PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(12),
  AUTH_PASSWORD_MAX_LENGTH: z.coerce.number().int().min(32).default(128),
  AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60_000),
});

export type Env = z.infer<typeof envSchema> & {
  ROOT_DIR: string;
};

export function loadEnvironment(overrides: Record<string, string | undefined> = {}): Env {
  const parsed = envSchema.safeParse({
    ...process.env,
    ...overrides,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;

  // Render (and most PaaS) inject PORT; prefer it over API_PORT when set.
  let apiPort = data.API_PORT;
  const platformPort = process.env.PORT?.trim();
  if (platformPort) {
    const parsedPort = Number(platformPort);
    if (Number.isFinite(parsedPort) && parsedPort > 0) {
      apiPort = parsedPort;
    }
  }

  if (data.DATABASE_PATH && !data.DATABASE_URL) {
    console.warn(
      "[env] DATABASE_PATH is deprecated and ignored (SQLite removed). Set DATABASE_URL to a Postgres/Supabase URI.",
    );
  }

  if (data.NODE_ENV === "production") {
    if (!data.DATABASE_URL.trim()) {
      throw new Error(
        "Invalid environment configuration: DATABASE_URL is required in production",
      );
    }
    if (data.AUTH_MODE !== "session") {
      throw new Error(
        "Invalid environment configuration: AUTH_MODE must be 'session' in production",
      );
    }
    if (data.APP_ALLOWED_ORIGINS.length === 0) {
      throw new Error(
        "Invalid environment configuration: APP_ALLOWED_ORIGINS is required in production",
      );
    }
    if (data.APP_ALLOWED_ORIGINS.some((origin) => origin === "*")) {
      throw new Error(
        "Invalid environment configuration: wildcard CORS origins are not allowed in production",
      );
    }
  }

  return {
    ...data,
    API_PORT: apiPort,
    ROOT_DIR: rootDir,
  };
}

export const env = loadEnvironment();

export function hasOpenAiKey(config: Env = env): boolean {
  return Boolean(
    config.OPENROUTER_API_KEY?.trim() || config.OPENAI_API_KEY?.trim(),
  );
}

export type LlmProviderConfig = {
  apiKey: string;
  baseURL?: string;
  model: string;
  supportsStore: boolean;
  supportsStructuredOutput: boolean;
  /** OpenAI Responses chaining. OpenRouter rejects previous_response_id. */
  supportsPreviousResponseId: boolean;
  defaultHeaders?: Record<string, string>;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Router that selects a free model supporting tools/streaming for the request. */
const FREE_AGENT_MODEL = "openrouter/free";

/**
 * Prefer OpenRouter when OPENROUTER_API_KEY is set (free models with tool calling).
 * Otherwise use OpenAI (or OPENAI_BASE_URL override) with OPENAI_API_KEY.
 */
export function resolveLlmProvider(config: Env = env): LlmProviderConfig {
  const openRouterKey = config.OPENROUTER_API_KEY.trim();
  const openAiKey = config.OPENAI_API_KEY.trim();
  const explicitBase = config.OPENAI_BASE_URL.trim().replace(/\/$/, "");
  const model = config.OPENAI_MODEL.trim() || FREE_AGENT_MODEL;
  // OpenRouter keys are typically `sk-or-...`. Don't send a native OpenAI key to OpenRouter.
  const openRouterCredential =
    openRouterKey ||
    (openAiKey.startsWith("sk-or-") ? openAiKey : "");

  if (openRouterCredential) {
    const structured = config.OPENAI_STRUCTURED_OUTPUT ?? false;
    return {
      apiKey: openRouterCredential,
      baseURL: explicitBase || OPENROUTER_BASE_URL,
      model:
        model.includes("/") || model.endsWith(":free")
          ? model
          : FREE_AGENT_MODEL,
      supportsStore: false,
      supportsStructuredOutput: structured,
      supportsPreviousResponseId: false,
      defaultHeaders: {
        "HTTP-Referer": config.OPENAI_HTTP_REFERER || "http://localhost:5173",
        "X-Title": config.OPENAI_APP_TITLE || "Minimi Research Agent",
      },
    };
  }

  const structured = config.OPENAI_STRUCTURED_OUTPUT ?? true;
  const paidModel =
    model.includes(":free") || model === "openrouter/free"
      ? "gpt-4.1-mini"
      : model || "gpt-4.1-mini";
  return {
    apiKey: openAiKey,
    baseURL:
      explicitBase && !explicitBase.includes("openrouter.ai")
        ? explicitBase
        : undefined,
    model: paidModel,
    supportsStore: true,
    supportsStructuredOutput: structured,
    supportsPreviousResponseId: true,
  };
}

export function hasTavilyKey(config: Env = env): boolean {
  return Boolean(config.TAVILY_API_KEY?.trim());
}
