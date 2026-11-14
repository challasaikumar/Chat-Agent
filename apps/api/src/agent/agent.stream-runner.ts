import type { AgentEvent, CitationReference } from "@minimi/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../config/env.js";
import { hasOpenAiKey } from "../config/env.js";
import type { AppDatabase } from "../db/index.js";
import type { SearchProvider } from "../search/search.interface.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { EvidenceService } from "../evidence/evidence.service.js";
import { TemporalService } from "../temporal/temporal.service.js";
import type { TemporalPrepareResult } from "../temporal/temporal.types.js";
import { loadAgentConfig } from "./agent.config.js";
import { AgentRunRepository } from "./agent-run.repository.js";
import { CitationRegistry } from "./citations/citation.registry.js";
import { validateAndSanitizeAnswer } from "./citations/citation.validator.js";
import { ContextBuilder } from "./context/context.builder.js";
import {
  AgentError,
  agentConfigurationError,
  agentValidationError,
} from "./errors/agent.errors.js";
import { FunctionCallHandler } from "./openai/function-call.handler.js";
import type { ResponsesClient } from "./openai/responses.client.js";
import { accumulateUsage } from "./openai/response.parser.js";
import {
  OpenAiStreamingResponsesClient,
  type StreamingResponsesClient,
} from "./openai/responses.stream.js";
import { TurnTranscript } from "./openai/turn-transcript.js";
import {
  shouldAutoTitle,
  titleFromUserMessage,
} from "./utils/conversation-title.js";
import { compactToolOutput } from "./utils/compact-tool-output.js";
import { isLocalFormatFollowUp } from "./utils/follow-up-intent.js";
import { resolveLlmProvider } from "../config/env.js";
import { agentStreamBodySchema } from "./agent.schemas.js";
import type { AgentTurnContext } from "./agent.types.js";
import { ToolExecutor } from "./tools/tool-executor.js";
import { ToolRegistry } from "./tools/tool.registry.js";
import { WebSearchTool } from "./tools/web-search.tool.js";
import { conversationLock } from "./utils/conversation-lock.js";
import { ExecutionBudget } from "./utils/execution-budget.js";
import { notFound } from "../utils/errors.js";
import { loadPerfConfig } from "../performance/perf.config.js";
import { getMetricsRegistry } from "../performance/metrics.registry.js";
import { getResourceGate } from "../performance/resource-gate.js";

export type StreamEmit = (event: AgentEvent) => void;

/**
 * Streaming agent turn — reuses Phase 04 tool execution, citations,
 * temporal, and evidence services. Emits application-level AgentEvents.
 */
export class AgentStreamRunner {
  private readonly config;
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;
  private readonly runs: AgentRunRepository;
  private readonly temporal: TemporalService;
  private readonly evidence: EvidenceService;
  private readonly research: ResearchRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly env: Env,
    private readonly options: {
      searchProvider?: SearchProvider;
      responsesClient?: ResponsesClient;
      streamingClient?: StreamingResponsesClient;
      logger?: FastifyBaseLogger;
    } = {},
  ) {
    this.config = loadAgentConfig(env);
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.runs = new AgentRunRepository(db);
    this.temporal = new TemporalService(db, env);
    this.research = new ResearchRepository(db);
    this.evidence = new EvidenceService(
      db,
      env,
      (options.logger as FastifyBaseLogger) ??
        ({
          info: () => undefined,
          warn: () => undefined,
          error: () => undefined,
          debug: () => undefined,
        } as unknown as FastifyBaseLogger),
    );
  }

  async runTurnStream(
    rawBody: unknown,
    context: AgentTurnContext & { signal?: AbortSignal },
    emit: StreamEmit,
  ): Promise<void> {
    if (!hasOpenAiKey(this.env) && !this.options.streamingClient && !this.options.responsesClient) {
      throw agentConfigurationError();
    }

    const parsed = agentStreamBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw agentValidationError("Invalid agent stream request", parsed.error.flatten());
    }

    const timeZone = parsed.data.timeZone ?? this.config.defaultTimeZone;
    const conversation = await this.conversations.findByIdForUser(
      parsed.data.conversationId,
      context.userId,
    );
    if (!conversation) {
      throw notFound("Conversation not found");
    }

    // Idempotency: return completed run for the same clientRequestId
    if (parsed.data.clientRequestId) {
      const existing = await this.runs.findByClientRequestId(
        context.userId,
        parsed.data.clientRequestId,
      );
      if (existing?.status === "completed" && existing.assistantMessageId) {
        const assistant = await this.messages.findById(existing.assistantMessageId);
        emit({
          type: "run.started",
          runId: existing.id,
          conversationId: existing.conversationId,
          clientRequestId: parsed.data.clientRequestId,
        });
        emit({
          type: "run.completed",
          runId: existing.id,
          messageId: existing.assistantMessageId,
          conversationId: existing.conversationId,
          citations: [],
          usage: {
            inputTokens: existing.inputTokens,
            outputTokens: existing.outputTokens,
          },
          execution: {
            toolCallCount: existing.toolCallCount,
            searchCallCount: existing.searchCallCount,
            durationMs: existing.durationMs ?? 0,
          },
          status: "completed",
          answer: assistant?.content ?? "",
        });
        return;
      }
      if (existing?.status === "running") {
        emit({
          type: "run.error",
          code: "AGENT_DUPLICATE_REQUEST",
          message: "This request is already in progress",
          retryable: false,
        });
        return;
      }
    }

    const perf = loadPerfConfig(this.env);
    const metrics = getMetricsRegistry(perf);
    const gate = getResourceGate(perf, metrics);
    metrics.activeStreams += 1;

    try {
    await gate.withAgentRun(
      async () =>
        conversationLock.runExclusive(parsed.data.conversationId, async () => {
      const startedAt = Date.now();
      const log = this.options.logger;
      const signal = context.signal;

      const userMessage = await this.messages.insert({
        conversationId: parsed.data.conversationId,
        role: "user",
        content: parsed.data.message,
      });

      const run = await this.runs.create({
        userId: context.userId,
        conversationId: parsed.data.conversationId,
        model: this.config.model,
        userMessageId: userMessage.id,
        clientRequestId: parsed.data.clientRequestId ?? null,
      });

      emit({
        type: "run.started",
        runId: run.id,
        conversationId: parsed.data.conversationId,
        clientRequestId: parsed.data.clientRequestId ?? null,
      });

      const registry = new CitationRegistry();
      const budget = new ExecutionBudget(this.config);
      const contextBuilder = new ContextBuilder(
        this.db,
        this.env,
        this.config,
      );

      const abortIfNeeded = () => {
        if (signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }
      };

      try {
        emit({
          type: "agent.status",
          stage: "retrieving_context",
          message: "Reviewing previous conversations",
        });

        const built = await contextBuilder.build({
          userId: context.userId,
          conversationId: parsed.data.conversationId,
          userMessageId: userMessage.id,
          userMessage: parsed.data.message,
          timeZone,
          registry,
        });

        let temporalPrepare: TemporalPrepareResult | null = null;
        let promptText = built.promptText;
        const turnSnapshotIds: string[] = [];

        if (this.temporal.enabled) {
          temporalPrepare = await this.temporal.prepareTurn({
            userId: context.userId,
            conversationId: parsed.data.conversationId,
            message: parsed.data.message,
            timeZone,
          });
          if (temporalPrepare.intent.isComparison) {
            promptText = `${built.promptText}\n\n${temporalPrepare.baselineSummary}`;
            emit({
              type: "agent.status",
              stage: "comparing_information",
              message: "Comparing historical and current information",
            });
          }
        }

        const localFormatFollowUp = isLocalFormatFollowUp(parsed.data.message);
        let priorAssistantAnswer = "";
        if (localFormatFollowUp) {
          const recent = await this.messages.listForConversation(
            parsed.data.conversationId,
            { limit: 12, order: "desc" },
          );
          priorAssistantAnswer =
            recent.items.find(
              (item) =>
                item.role === "assistant" &&
                item.content &&
                !item.content.startsWith("Calling tool ") &&
                item.content !== "I could not produce a complete answer.",
            )?.content ?? "";
          if (priorAssistantAnswer) {
            promptText = `${promptText}\n\nPrevious assistant answer to reformat (authoritative source for this turn — do not search the web):\n"""\n${priorAssistantAnswer.slice(0, 8_000)}\n"""\n\nFollow the user's formatting request using ONLY that previous answer. Produce a clear markdown comparison table when asked. Do not call tools.`;
          }
        }

        const toolRegistry = new ToolRegistry();
        toolRegistry.register(
          new WebSearchTool(
            this.db,
            this.env,
            this.config,
            registry,
            budget,
            this.options.searchProvider,
          ),
        );
        const toolExecutor = new ToolExecutor(this.db, toolRegistry, budget);
        const functionHandler = new FunctionCallHandler(toolExecutor);

        const streaming =
          this.options.streamingClient ??
          new OpenAiStreamingResponsesClient(this.env, this.config);

        let usage = { inputTokens: 0, outputTokens: 0 };
        let previousResponseId: string | null = null;
        // Format / compare follow-ups must not burn the turn on web_search.
        let toolChoice: "auto" | "none" = localFormatFollowUp ? "none" : "auto";
        let iterations = 0;
        let answerText = "";
        let citations = registry.list().slice(0, 0);
        let comparisonInjected = false;
        let evidenceInjected = false;
        let composing = false;
        const provider = resolveLlmProvider(this.env);
        const chainResponses = provider.supportsPreviousResponseId;
        const transcript = new TurnTranscript(promptText);

        emit({
          type: "agent.status",
          stage: localFormatFollowUp ? "composing_answer" : "planning_research",
          message: localFormatFollowUp
            ? "Formatting the previous answer"
            : "Planning how to answer",
        });

        abortIfNeeded();

        const runRound = async (
          input: Parameters<StreamingResponsesClient["streamRound"]>[0],
          emitDeltas: boolean,
        ) => {
          const result = await streaming.streamRound(input, {
            signal,
            emitAnswerDeltas: emitDeltas,
            onAnswerDelta: (delta) => {
              if (!composing) {
                composing = true;
                emit({
                  type: "agent.status",
                  stage: "composing_answer",
                  message: "Preparing the answer",
                });
              }
              emit({ type: "message.delta", delta });
            },
          });
          usage = accumulateUsage(usage, result.response);
          return result;
        };

        let round = await runRound(
          {
            model: this.config.model,
            maxOutputTokens: this.config.maxOutputTokens,
            toolChoice,
            input: transcript.snapshot(),
          },
          localFormatFollowUp,
        );
        previousResponseId =
          chainResponses && round.response.id !== "incomplete"
            ? round.response.id
            : null;

        while (iterations <= this.config.maxToolIterations) {
          abortIfNeeded();
          // Free models are slow: leave time for a final answer instead of hard-failing.
          if (budget.remainingMs() < 25_000) {
            if (answerText.trim()) {
              break;
            }
            toolChoice = "none";
            const hurryMessage =
              "Time is limited. Produce the best final answer now from available evidence. Be concise. Disclose limitations.";
            if (!chainResponses) {
              transcript.appendUserMessage(hurryMessage);
            }
            round = await runRound(
              {
                model: this.config.model,
                maxOutputTokens: Math.min(800, this.config.maxOutputTokens),
                previousResponseId: chainResponses ? previousResponseId : null,
                toolChoice: "none",
                input: chainResponses
                  ? [{ role: "user", content: hurryMessage }]
                  : transcript.snapshot(),
              },
              true,
            );
            answerText = round.answerText || answerText;
            break;
          }

          const calls = localFormatFollowUp
            ? []
            : round.functionCalls.filter((c) => c.name === "web_search");

          if (calls.length === 0) {
            if (temporalPrepare?.intent.isComparison && !comparisonInjected) {
              const comparison = await this.temporal.finalizeComparison({
                userId: context.userId,
                conversationId: parsed.data.conversationId,
                agentRunId: run.id,
                prepare: temporalPrepare,
                currentSnapshotIds: turnSnapshotIds,
              });
              comparisonInjected = true;
              if (comparison) {
                emit({
                  type: "agent.status",
                  stage: "comparing_information",
                  message: "Comparing historical and current information",
                });
                const comparisonMessage = `${comparison.promptBlock}\n\nExplain this comparison for the user. Use only available evidence. Disclose limitations.`;
                if (!chainResponses) {
                  transcript.appendUserMessage(comparisonMessage);
                }
                round = await runRound(
                  {
                    model: this.config.model,
                    maxOutputTokens: this.config.maxOutputTokens,
                    previousResponseId: chainResponses
                      ? previousResponseId
                      : null,
                    toolChoice: "none",
                    input: chainResponses
                      ? [
                          {
                            role: "user",
                            content: comparisonMessage,
                          },
                        ]
                      : transcript.snapshot(),
                  },
                  true,
                );
                if (chainResponses) {
                  previousResponseId =
                    round.response.id !== "incomplete"
                      ? round.response.id
                      : previousResponseId;
                }
                answerText = round.answerText || answerText;
                continue;
              }
            }

            // Final synthesis — stream answer deltas
            if (!composing && round.answerText) {
              // Non-streamed answer fallback (mock clients)
              for (const chunk of chunkText(round.answerText, 48)) {
                abortIfNeeded();
                emit({ type: "message.delta", delta: chunk });
              }
              answerText = round.answerText;
            } else {
              answerText = round.answerText || answerText;
            }
            break;
          }

          if (
            !budget.canCallTool() ||
            budget.searchCalls >= this.config.maxSearchesPerTurn
          ) {
            toolChoice = "none";
            let budgetMessage =
              "Tool budget exhausted. Produce the best final answer using only available evidence. Disclose limitations. Do not invent search results.";
            if (temporalPrepare?.intent.isComparison && !comparisonInjected) {
              const comparison = await this.temporal.finalizeComparison({
                userId: context.userId,
                conversationId: parsed.data.conversationId,
                agentRunId: run.id,
                prepare: temporalPrepare,
                currentSnapshotIds: turnSnapshotIds,
              });
              comparisonInjected = true;
              if (comparison) {
                budgetMessage = `${comparison.promptBlock}\n\n${budgetMessage}`;
              }
            }
            if (!chainResponses) {
              transcript.appendUserMessage(budgetMessage);
            }
            round = await runRound(
              {
                model: this.config.model,
                maxOutputTokens: this.config.maxOutputTokens,
                previousResponseId: chainResponses ? previousResponseId : null,
                toolChoice: "none",
                input: chainResponses
                  ? [{ role: "user", content: budgetMessage }]
                  : transcript.snapshot(),
              },
              true,
            );
            answerText = round.answerText || answerText;
            break;
          }

          emit({
            type: "agent.status",
            stage: "searching",
            message: "Searching the web",
          });

          const handled = await functionHandler.handleAll(
            calls.map((c) => ({
              type: "function_call" as const,
              id: c.callId,
              call_id: c.callId,
              name: c.name,
              arguments: c.arguments,
              status: "completed" as const,
            })),
            {
              userId: context.userId,
              conversationId: parsed.data.conversationId,
              requestId: context.requestId,
            },
          );

          for (const item of handled) {
            const query =
              typeof item.output === "object" &&
              item.output &&
              "query" in item.output &&
              typeof (item.output as { query?: unknown }).query === "string"
                ? (item.output as { query: string }).query
                : "web search";

            emit({
              type: "tool.started",
              toolCallId: item.callId,
              toolName: "web_search",
              query,
            });

            const snapshotId = extractSnapshotId(item.output);
            if (snapshotId) {
              turnSnapshotIds.push(snapshotId);
            }
            const resultCount =
              typeof item.output === "object" &&
              item.output &&
              "sources" in item.output &&
              Array.isArray((item.output as { sources?: unknown }).sources)
                ? (item.output as { sources: unknown[] }).sources.length
                : 0;

            emit({
              type: "tool.completed",
              toolCallId: item.callId,
              toolName: "web_search",
              resultCount,
              snapshotId,
            });
          }

          for (const record of registry.list()) {
            emit({
              type: "citation.available",
              citation: toCitationReference(record),
            });
          }

          iterations += 1;

          const toolOutputs: Array<
            | {
                type: "function_call_output";
                call_id: string;
                output: string;
              }
            | { role: "user"; content: string }
          > = handled.map((item) => ({
            type: "function_call_output" as const,
            call_id: item.callId,
            output: compactToolOutput(item.output),
          }));

          // Skip heavy evidence verification on OpenRouter/free providers — it
          // routinely burns the whole turn budget and causes timeouts.
          if (
            this.evidence.enabled &&
            chainResponses &&
            !evidenceInjected &&
            turnSnapshotIds.length > 0 &&
            budget.remainingMs() >= 45_000
          ) {
            emit({
              type: "agent.status",
              stage: "evaluating_sources",
              message: "Evaluating source quality",
            });
            try {
              const unique = [...new Set(turnSnapshotIds)];
              const evidenceBudgetMs = Math.min(25_000, budget.remainingMs() - 30_000);
              const evidenceWork = (async () => {
                const snapshots = (
                  await Promise.all(
                    unique.map((id) =>
                      this.research.findSnapshotForUser(id, context.userId),
                    ),
                  )
                ).filter((s): s is NonNullable<typeof s> => Boolean(s));
                if (snapshots.length > 0) {
                  await this.temporal.extractClaimsForSnapshots({
                    userId: context.userId,
                    snapshots,
                    useOpenAi: false,
                  });
                }
                return this.evidence.evaluateClaimsForSnapshots({
                  userId: context.userId,
                  snapshotIds: unique,
                });
              })();
              const evidenceResult = await Promise.race([
                evidenceWork,
                new Promise<null>((resolve) => {
                  setTimeout(() => resolve(null), Math.max(5_000, evidenceBudgetMs));
                }),
              ]);
              evidenceInjected = true;
              if (evidenceResult) {
                toolOutputs.push({
                  role: "user",
                  content: `${evidenceResult.evidenceBriefing}\n\nUse this evidence assessment when answering. Disclose conflicts and gaps. Cite only registered evidence IDs.`,
                });
              }
            } catch (error) {
              log?.warn(
                {
                  err:
                    error instanceof Error
                      ? { name: error.name, message: error.message }
                      : { message: "evidence failed" },
                },
                "Evidence evaluation skipped during stream",
              );
              evidenceInjected = true;
            }
          } else if (
            this.evidence.enabled &&
            !evidenceInjected &&
            turnSnapshotIds.length > 0
          ) {
            evidenceInjected = true;
          }

          // Prefer answering once we have search evidence — free models otherwise
          // keep searching until the turn budget is gone and return nothing.
          const shouldForceAnswer =
            !budget.canCallTool() ||
            budget.searchCalls >= this.config.maxSearchesPerTurn ||
            (budget.searchCalls >= 1 && budget.remainingMs() < 50_000) ||
            iterations >= this.config.maxToolIterations;

          const nextToolChoice = shouldForceAnswer ? "none" : "auto";
          toolChoice = nextToolChoice;
          if (!chainResponses) {
            transcript.appendFunctionCalls(calls);
            transcript.appendFunctionOutputs(
              handled.map((item) => ({
                callId: item.callId,
                output: item.output,
              })),
            );
            for (const item of toolOutputs) {
              if ("role" in item && item.role === "user") {
                transcript.appendUserMessage(item.content);
              }
            }
            if (shouldForceAnswer) {
              transcript.appendUserMessage(
                "You have enough search evidence. Write the final answer now for the user's question. If a complete list is impossible, say so and give the best verified sample. Use markdown. Do not call tools.",
              );
            }
          }
          round = await runRound(
            {
              model: this.config.model,
              maxOutputTokens: this.config.maxOutputTokens,
              previousResponseId: chainResponses ? previousResponseId : null,
              toolChoice: nextToolChoice,
              input: chainResponses
                ? shouldForceAnswer
                  ? [
                      ...toolOutputs,
                      {
                        role: "user" as const,
                        content:
                          "You have enough search evidence. Write the final answer now for the user's question. If a complete list is impossible, say so and give the best verified sample. Use markdown. Do not call tools.",
                      },
                    ]
                  : toolOutputs
                : transcript.snapshot(),
            },
            true,
          );
          if (chainResponses) {
            previousResponseId =
              round.response.id !== "incomplete"
                ? round.response.id
                : previousResponseId;
          }

          answerText = round.answerText || answerText;
          if (
            round.functionCalls.length === 0 ||
            shouldForceAnswer ||
            nextToolChoice === "none"
          ) {
            if (!composing && answerText) {
              for (const chunk of chunkText(answerText, 48)) {
                abortIfNeeded();
                emit({ type: "message.delta", delta: chunk });
              }
            }
            break;
          }
        }

        abortIfNeeded();

        // Last-resort recovery: never leave the user with an empty reply.
        if (!answerText.trim() && budget.remainingMs() > 8_000) {
          emit({
            type: "agent.status",
            stage: "composing_answer",
            message: "Preparing the answer",
          });
          const recoverySources = registry
            .list()
            .filter((item) => item.sourceType === "web_search" || item.url)
            .slice(0, 10)
            .map(
              (item, index) =>
                `${index + 1}. ${item.title}${item.domain ? ` (${item.domain})` : ""}${item.url ? ` — ${item.url}` : ""}\n   ${(item.contentExcerpt ?? "").slice(0, 180)}`,
            )
            .join("\n");
          const recoveryMessage = localFormatFollowUp && priorAssistantAnswer
            ? `Reformat the previous assistant answer per the user request. Use a markdown table for comparison when asked. Do not call tools.\n\nUser request: ${parsed.data.message}\n\nPrevious answer:\n${priorAssistantAnswer.slice(0, 8_000)}`
            : `Answer the user question using only this evidence. Be concrete. If coverage is incomplete, say that and list what you can verify.\n\nUser question: ${parsed.data.message}\n\nEvidence:\n${recoverySources || priorAssistantAnswer.slice(0, 4_000) || "(no source excerpts available — explain the limitation briefly)"}`;
          if (!chainResponses) {
            transcript.appendUserMessage(recoveryMessage);
          }
          const recovery = await runRound(
            {
              model: this.config.model,
              maxOutputTokens: Math.min(1200, this.config.maxOutputTokens),
              previousResponseId: chainResponses ? previousResponseId : null,
              toolChoice: "none",
              input: chainResponses
                ? [{ role: "user", content: recoveryMessage }]
                : transcript.snapshot(),
            },
            true,
          );
          answerText = recovery.answerText || answerText;
        }

        if (!answerText.trim() && priorAssistantAnswer) {
          // Deterministic table fallback so format follow-ups never die empty.
          answerText = priorAssistantAnswer.includes("|")
            ? priorAssistantAnswer
            : `Here is the previous answer reformatted for comparison:\n\n${priorAssistantAnswer}`;
        } else if (!answerText.trim() && turnSnapshotIds.length > 0) {
          answerText =
            "I found web sources for this question, but could not finish a full write-up in time. Please ask again with a narrower scope (for example: Bengaluru SaaS founded in 2025, top 10 only).";
        }

        const rawFinal = {
          answer: answerText || "I could not produce a complete answer.",
          citations: registry.list().map((r) => r.evidenceId),
        };
        const validated = validateAndSanitizeAnswer(rawFinal, registry);
        citations = validated.citations;

        for (const record of citations) {
          emit({
            type: "citation.available",
            citation: toCitationReference(record),
          });
        }

        const assistantMessage = await this.messages.insert({
          conversationId: parsed.data.conversationId,
          role: "assistant",
          content: validated.answer,
          metadata: {
            type: "final_answer",
            runId: run.id,
            citations: citations.map((item) => item.evidenceId),
            streamed: true,
          },
        });

        let conversationTitle: string | null = conversation.title ?? null;
        if (shouldAutoTitle(conversation.title)) {
          conversationTitle = titleFromUserMessage(parsed.data.message);
          await this.conversations.updateForUser(
            parsed.data.conversationId,
            context.userId,
            { title: conversationTitle },
          );
        }

        const durationMs = Date.now() - startedAt;
        await this.runs.update(run.id, {
          status: "completed",
          assistantMessageId: assistantMessage.id,
          toolCallCount: budget.toolIterations,
          searchCallCount: budget.searchCalls,
          inputTokens: usage.inputTokens || null,
          outputTokens: usage.outputTokens || null,
          completedAt: new Date(),
          durationMs,
        });

        emit({
          type: "run.completed",
          runId: run.id,
          messageId: assistantMessage.id,
          conversationId: parsed.data.conversationId,
          citations: citations.map(toCitationReference),
          usage: {
            inputTokens: usage.inputTokens || null,
            outputTokens: usage.outputTokens || null,
          },
          execution: {
            toolCallCount: budget.toolIterations,
            searchCallCount: budget.searchCalls,
            durationMs,
          },
          status: "completed",
          answer: validated.answer,
          conversationTitle,
        });
      } catch (error) {
        const aborted =
          signal?.aborted ||
          (error instanceof Error &&
            (error.name === "AbortError" || error.message === "Aborted"));

        const durationMs = Date.now() - startedAt;
        if (aborted) {
          await this.runs.update(run.id, {
            status: "cancelled",
            completedAt: new Date(),
            durationMs,
            errorCategory: "AGENT_CANCELLED",
            errorMessage: "Generation cancelled",
          });
          emit({
            type: "run.cancelled",
            runId: run.id,
            status: "cancelled",
          });
          return;
        }

        const category =
          error instanceof AgentError ? error.code : "AGENT_PROVIDER_ERROR";
        const message =
          error instanceof Error ? error.message : "Agent turn failed";

        await this.runs.update(run.id, {
          status: "failed",
          completedAt: new Date(),
          durationMs,
          errorCategory: category,
          errorMessage: message,
        });

        emit({
          type: "run.error",
          code: category,
          message:
            category === "AGENT_CONFIGURATION_ERROR" ||
            category === "AGENT_VALIDATION_ERROR" ||
            category === "AGENT_PROVIDER_ERROR" ||
            category === "AGENT_TIMEOUT_ERROR" ||
            category === "AGENT_BUDGET_EXHAUSTED" ||
            category === "AGENT_TOOL_ERROR" ||
            category === "AGENT_INCOMPLETE_RESPONSE"
              ? message
              : "Unable to complete the request",
          retryable:
            category !== "AGENT_VALIDATION_ERROR" &&
            category !== "AGENT_CONFIGURATION_ERROR",
        });
      }
        }),
      context.signal,
    );
    } finally {
      metrics.activeStreams = Math.max(0, metrics.activeStreams - 1);
    }
  }
}

function extractSnapshotId(output: unknown): string | null {
  if (!output || typeof output !== "object") {
    return null;
  }
  const record = output as Record<string, unknown>;
  return typeof record.snapshotId === "string" ? record.snapshotId : null;
}

function toCitationReference(record: {
  evidenceId: string;
  title: string;
  url: string | null;
  domain: string | null;
  retrievedAt: string | null;
  publishedAt: string | null;
  contentExcerpt: string;
  sourceType: string;
}): CitationReference {
  return {
    id: record.evidenceId,
    title: record.title,
    url: record.url,
    domain: record.domain,
    retrievedAt: record.retrievedAt,
    publishedAt: record.publishedAt,
    contentExcerpt: record.contentExcerpt.slice(0, 400),
    sourceType: record.sourceType,
  };
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
