import type { Env } from "../config/env.js";
import { hasOpenAiKey } from "../config/env.js";
import { tryGetOpenAiClient } from "../openai/openai.client.js";
import {
  MemoryConfigurationError,
  MemoryExtractionError,
  type MemoryExtractor,
} from "./memory-extractor.interface.js";
import {
  memoryExtractionJsonSchema,
  memoryExtractionResultSchema,
} from "./memory.schemas.js";
import type {
  MemoryExtractionRequest,
  MemoryExtractionResult,
} from "./memory.types.js";
import type OpenAI from "openai";

const SYSTEM_PROMPT = `You extract durable conversational memory from chat messages.

Rules:
- Only extract information explicitly supported by the provided messages.
- Preserve exact evidence excerpts and source message IDs.
- Do not invent dates, products, decisions, or preferences.
- Do not turn questions into confirmed facts or preferences.
- Never treat assistant suggestions as facts about the user.
- Distinguish proposed / considered / confirmed / rejected / implemented decisions.
- Scope project-specific statements to a project entity; do not invent global preferences from project choices.
- One isolated interaction is not a durable preference unless explicitly stated.
- Prefer precise facts with provenance over speculation.
- Normalize entity display names; include useful aliases. Use entityType "project" for named projects.
- Extract relationships such as project->uses->technology when supported.
- When a previous summary is provided, fold uncovered messages into an updated summary.
- Never summarize away important decisions, names, dates, pricing references, or unresolved questions.
- confidence = evidence strength; importance = future usefulness (keep them separate).
- Return structured fields including memoryKey, assertionType, assertionStatus when possible.`;

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;
  return code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND";
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]");
  }
  return "Unknown OpenAI error";
}

export class OpenAiMemoryExtractor implements MemoryExtractor {
  private readonly client: OpenAI | null;

  constructor(private readonly env: Env) {
    this.client = hasOpenAiKey(env) ? tryGetOpenAiClient(env) : null;
  }

  async extract(request: MemoryExtractionRequest): Promise<MemoryExtractionResult> {
    if (!this.client) {
      throw new MemoryConfigurationError();
    }

    if (request.messages.length === 0) {
      throw new MemoryExtractionError("No messages available for memory extraction");
    }

    const transcript = request.messages
      .map((message) => `#${message.id} [${message.role}] ${message.content}`)
      .join("\n");

    const userPrompt = [
      `Conversation ID: ${request.conversationId}`,
      `Previous summary: ${request.previousSummary ?? "(none)"}`,
      "",
      "Messages:",
      transcript,
    ].join("\n");

    let attempt = 0;
    const maxAttempts = Math.max(1, this.env.OPENAI_MAX_RETRIES + 1);
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const response = await this.client.responses.create({
          model: this.env.OPENAI_MODEL || request.model,
          input: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "memory_extraction",
              strict: true,
              schema: memoryExtractionJsonSchema,
            },
          },
        });

        const text = response.output_text;
        if (!text?.trim()) {
          throw new MemoryExtractionError("OpenAI returned empty memory extraction output");
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          throw new MemoryExtractionError("OpenAI returned invalid JSON", {
            cause: error,
          });
        }

        const validated = memoryExtractionResultSchema.safeParse(parsed);
        if (!validated.success) {
          throw new MemoryExtractionError(
            `OpenAI output failed schema validation: ${validated.error.message}`,
          );
        }

        return validated.data;
      } catch (error) {
        lastError = error;
        if (error instanceof MemoryConfigurationError || error instanceof MemoryExtractionError) {
          if (!isRetryable(error) || attempt >= maxAttempts) {
            throw error;
          }
        } else if (!isRetryable(error) || attempt >= maxAttempts) {
          throw new MemoryExtractionError(sanitizeErrorMessage(error), {
            cause: error,
          });
        }
      }
    }

    throw new MemoryExtractionError(sanitizeErrorMessage(lastError), {
      cause: lastError,
    });
  }
}
