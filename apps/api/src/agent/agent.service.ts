import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type { SearchProvider } from "../search/search.interface.js";
import type { AgentEvent } from "@minimi/shared";
import { AgentOrchestrator } from "./agent.orchestrator.js";
import { AgentStreamRunner } from "./agent.stream-runner.js";
import { AgentRunRepository } from "./agent-run.repository.js";
import type { ResponsesClient } from "./openai/responses.client.js";
import type { StreamingResponsesClient } from "./openai/responses.stream.js";
import type {
  AgentRunView,
  AgentTurnContext,
  AgentTurnResult,
} from "./agent.types.js";
import { notFound } from "../utils/errors.js";

export class AgentService {
  private readonly orchestrator: AgentOrchestrator;
  private readonly streamRunner: AgentStreamRunner;
  private readonly runs: AgentRunRepository;

  constructor(
    db: AppDatabase,
    env: Env,
    options: {
      searchProvider?: SearchProvider;
      responsesClient?: ResponsesClient;
      streamingClient?: StreamingResponsesClient;
      logger?: FastifyBaseLogger;
    } = {},
  ) {
    this.orchestrator = new AgentOrchestrator(db, env, options);
    this.streamRunner = new AgentStreamRunner(db, env, options);
    this.runs = new AgentRunRepository(db);
  }

  async runTurn(rawBody: unknown, context: AgentTurnContext): Promise<AgentTurnResult> {
    return this.orchestrator.runTurn(rawBody, context);
  }

  async runTurnStream(
    rawBody: unknown,
    context: AgentTurnContext & { signal?: AbortSignal },
    emit: (event: AgentEvent) => void,
  ): Promise<void> {
    return this.streamRunner.runTurnStream(rawBody, context, emit);
  }

  async getRun(runId: string, userId: string): Promise<AgentRunView> {
    const run = await this.runs.findByIdForUser(runId, userId);
    if (!run) {
      throw notFound("Agent run not found");
    }

    const toolCalls = run.userMessageId
      ? await this.runs.listToolCallsForConversation(
          run.conversationId,
          run.userMessageId,
        )
      : [];

    return {
      id: run.id,
      conversationId: run.conversationId,
      status: run.status,
      model: run.model,
      toolCallCount: run.toolCallCount,
      searchCallCount: run.searchCallCount,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      durationMs: run.durationMs,
      errorCategory: run.errorCategory,
      errorMessage: run.errorMessage,
      toolCalls: toolCalls.map((row) => ({
        id: row.id,
        toolName: row.toolName,
        status: row.status,
        arguments: row.arguments,
        result: row.result,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }
}
