import type OpenAI from "openai";
import type {
  Response as OpenAIResponse,
  ResponseFunctionToolCall,
  ResponseStreamEvent,
} from "openai/resources/responses/responses.js";
import type { Env } from "../../config/env.js";
import { hasOpenAiKey } from "../../config/env.js";
import { getOpenAiClient } from "../../openai/openai.client.js";
import { buildResponsesCreateArgs } from "../../openai/responses-params.js";
import type { AgentConfig } from "../agent.config.js";
import {
  agentConfigurationError,
  agentProviderError,
  agentTimeoutError,
} from "../errors/agent.errors.js";
import { sanitizeSecret } from "../../search/search.utils.js";
import type { ResponsesCreateInput } from "./responses.client.js";
import { AnswerJsonExtractor } from "../streaming/answer-json.extractor.js";

export type StreamedFunctionCall = {
  callId: string;
  name: string;
  arguments: string;
};

export type StreamRoundResult = {
  response: OpenAIResponse;
  functionCalls: StreamedFunctionCall[];
  answerText: string;
  streamedAnswer: string;
};

export type StreamRoundHandlers = {
  signal?: AbortSignal;
  emitAnswerDeltas?: boolean;
  onAnswerDelta?: (delta: string) => void;
  onEvent?: (event: ResponseStreamEvent) => void;
};

export interface StreamingResponsesClient {
  streamRound(
    input: ResponsesCreateInput,
    handlers?: StreamRoundHandlers,
  ): Promise<StreamRoundResult>;
}

export class OpenAiStreamingResponsesClient implements StreamingResponsesClient {
  private readonly client: OpenAI;

  constructor(
    private readonly env: Env,
    private readonly config: AgentConfig,
  ) {
    if (!hasOpenAiKey(env)) {
      throw agentConfigurationError();
    }
    this.client = getOpenAiClient(env);
  }

  async streamRound(
    input: ResponsesCreateInput,
    handlers: StreamRoundHandlers = {},
  ): Promise<StreamRoundResult> {
    try {
      const stream = (await this.client.responses.create(
        buildResponsesCreateArgs(this.env, this.config, input, {
          stream: true,
        }) as never,
        handlers.signal ? { signal: handlers.signal } : undefined,
      )) as unknown as AsyncIterable<ResponseStreamEvent>;

      return await consumeResponseStream(stream, handlers);
    } catch (error) {
      if (handlers.signal?.aborted) {
        throw error;
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string" &&
        String((error as { code: string }).code).startsWith("AGENT_")
      ) {
        throw error;
      }
      if (isTimeout(error)) {
        throw agentTimeoutError();
      }
      throw agentProviderError(
        sanitizeSecret(error instanceof Error ? error.message : "OpenAI error"),
      );
    }
  }
}

async function consumeResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  handlers: StreamRoundHandlers,
): Promise<StreamRoundResult> {
  let completed: OpenAIResponse | null = null;
  const functionCalls = new Map<
    string,
    { callId: string; name: string; arguments: string }
  >();
  const extractor = new AnswerJsonExtractor();
  let rawText = "";
  let streamedAnswer = "";

  for await (const event of stream) {
    if (handlers.signal?.aborted) {
      break;
    }
    handlers.onEvent?.(event);

    if (event.type === "response.output_item.added") {
      const item = event.item;
      if (item.type === "function_call") {
        functionCalls.set(item.id ?? item.call_id, {
          callId: item.call_id,
          name: item.name,
          arguments: item.arguments ?? "",
        });
      }
    }

    if (event.type === "response.output_item.done") {
      const item = event.item;
      if (item.type === "function_call") {
        functionCalls.set(item.id ?? item.call_id, {
          callId: item.call_id,
          name: item.name,
          arguments: item.arguments ?? "",
        });
      }
    }

    if (event.type === "response.function_call_arguments.delta") {
      const keyed = functionCalls.get(event.item_id);
      if (keyed) {
        keyed.arguments += event.delta;
      }
    }

    if (event.type === "response.function_call_arguments.done") {
      const keyed = functionCalls.get(event.item_id);
      if (keyed) {
        keyed.arguments = event.arguments;
      } else {
        functionCalls.set(event.item_id, {
          callId: event.item_id,
          name: "web_search",
          arguments: event.arguments,
        });
      }
    }

    if (event.type === "response.output_text.delta") {
      rawText += event.delta;
      if (handlers.emitAnswerDeltas) {
        const slice = extractor.push(event.delta);
        if (slice) {
          streamedAnswer += slice;
          handlers.onAnswerDelta?.(slice);
        }
      }
    }

    if (event.type === "response.completed") {
      completed = event.response;
    }

    if (event.type === "response.failed") {
      throw agentProviderError(
        sanitizeSecret(event.response.error?.message ?? "OpenAI response failed"),
      );
    }

    if (event.type === "error") {
      throw agentProviderError(sanitizeSecret(event.message ?? "OpenAI stream error"));
    }
  }

  if (!completed) {
    completed = {
      id: "incomplete",
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      status: handlers.signal?.aborted ? "cancelled" : "incomplete",
      error: null,
      incomplete_details: { reason: "content_filter" },
      model: "",
      output: [...functionCalls.values()].map(
        (call): ResponseFunctionToolCall => ({
          type: "function_call",
          id: call.callId,
          call_id: call.callId,
          name: call.name,
          arguments: call.arguments,
          status: "completed",
        }),
      ),
      usage: null,
      output_text: rawText,
    } as unknown as OpenAIResponse;
  }

  // When deltas were not emitted (planning rounds), still extract answer from the
  // full buffer — free models often wrap JSON in ```json fences.
  if (!streamedAnswer && rawText) {
    const fromExtractor = new AnswerJsonExtractor();
    fromExtractor.push(rawText);
    streamedAnswer = fromExtractor.getAnswer();
  }

  const parsedAnswer = tryParseAnswer(rawText);
  const answerText =
    streamedAnswer ||
    extractor.getAnswer() ||
    parsedAnswer ||
    // Prefer readable prose over a raw JSON blob when extraction fails.
    (stripJsonFence(rawText).startsWith("{") ? "" : stripJsonFence(rawText));

  return {
    response: completed,
    functionCalls: [...functionCalls.values()],
    answerText,
    streamedAnswer,
  };
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || trimmed;
}

function tryParseAnswer(raw: string): string {
  const candidate = stripJsonFence(raw);
  try {
    const parsed = JSON.parse(candidate) as { answer?: unknown };
    return typeof parsed.answer === "string" ? parsed.answer : "";
  } catch {
    // Free models sometimes emit prose + a trailing JSON object.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(candidate.slice(start, end + 1)) as {
          answer?: unknown;
        };
        if (typeof parsed.answer === "string") {
          return parsed.answer;
        }
      } catch {
        // fall through to regex / prose heuristics
      }
    }

    // Truncated JSON: pull the answer string even if the object never closed.
    const match = candidate.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (match?.[1]) {
      return match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }

    // Model ignored JSON and wrote markdown/prose.
    const prose = candidate.trim();
    if (
      prose &&
      !prose.startsWith("{") &&
      (prose.includes("\n") || prose.length > 40 || /^#{1,3}\s/m.test(prose))
    ) {
      return prose;
    }
    return "";
  }
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    message.includes("timeout")
  );
}
