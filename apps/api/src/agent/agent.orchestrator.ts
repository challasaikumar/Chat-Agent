import type { FastifyBaseLogger } from "fastify";
import type { Env } from "../config/env.js";
import { hasOpenAiKey, resolveLlmProvider } from "../config/env.js";
import { TurnTranscript } from "./openai/turn-transcript.js";
import {
  shouldAutoTitle,
  titleFromUserMessage,
} from "./utils/conversation-title.js";
import { compactToolOutput } from "./utils/compact-tool-output.js";
import type { AppDatabase } from "../db/index.js";
import type { SearchProvider } from "../search/search.interface.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { MessageRepository } from "../repositories/message.repository.js";
import { MemoryService } from "../memory/memory.service.js";
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
import {
  OpenAiResponsesClient,
  type ResponsesClient,
} from "./openai/responses.client.js";
import {
  accumulateUsage,
  extractFunctionCalls,
  parseFinalAnswer,
} from "./openai/response.parser.js";
import { ToolExecutor } from "./tools/tool-executor.js";
import { ToolRegistry } from "./tools/tool.registry.js";
import { WebSearchTool } from "./tools/web-search.tool.js";
import { conversationLock } from "./utils/conversation-lock.js";
import { ExecutionBudget } from "./utils/execution-budget.js";
import { agentTurnBodySchema } from "./agent.schemas.js";
import type {
  AgentTurnContext,
  AgentTurnResult,
} from "./agent.types.js";
import { notFound } from "../utils/errors.js";
import { TemporalService } from "../temporal/temporal.service.js";
import type { TemporalPrepareResult } from "../temporal/temporal.types.js";
import { EvidenceService } from "../evidence/evidence.service.js";
import type { ClaimVerificationOutcome } from "../evidence/evidence.types.js";
import { ResearchRepository } from "../repositories/research.repository.js";
import { loadPerfConfig } from "../performance/perf.config.js";
import { getMetricsRegistry } from "../performance/metrics.registry.js";
import { getResourceGate } from "../performance/resource-gate.js";
import { StageTimer } from "../performance/stage-timer.js";

export class AgentOrchestrator {
  private readonly config;
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;
  private readonly runs: AgentRunRepository;
  private readonly memory: MemoryService;
  private readonly temporal: TemporalService;
  private readonly evidence: EvidenceService;

  constructor(
    private readonly db: AppDatabase,
    private readonly env: Env,
    private readonly options: {
      searchProvider?: SearchProvider;
      responsesClient?: ResponsesClient;
      logger?: FastifyBaseLogger;
    } = {},
  ) {
    this.config = loadAgentConfig(env);
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
    this.runs = new AgentRunRepository(db);
    this.memory = new MemoryService(db, env);
    this.temporal = new TemporalService(db, env);
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

  async runTurn(
    rawBody: unknown,
    context: AgentTurnContext,
  ): Promise<AgentTurnResult> {
    if (!hasOpenAiKey(this.env) && !this.options.responsesClient) {
      throw agentConfigurationError();
    }

    const parsed = agentTurnBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw agentValidationError("Invalid agent turn request", parsed.error.flatten());
    }

    const timeZone = parsed.data.timeZone ?? this.config.defaultTimeZone;
    const conversation = await this.conversations.findByIdForUser(
      parsed.data.conversationId,
      context.userId,
    );
    if (!conversation) {
      throw notFound("Conversation not found");
    }

    const perf = loadPerfConfig(this.env);
    const metrics = getMetricsRegistry(perf);
    const gate = getResourceGate(perf, metrics);

    return gate.withAgentRun(async () =>
      conversationLock.runExclusive(parsed.data.conversationId, async () => {
      const startedAt = Date.now();
      const timer = new StageTimer();
      const log = this.options.logger;

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
      });

      log?.info(
        {
          runId: run.id,
          conversationId: parsed.data.conversationId,
          requestId: context.requestId,
        },
        "Agent turn started",
      );

      const registry = new CitationRegistry();
      const budget = new ExecutionBudget(this.config);
      const contextBuilder = new ContextBuilder(
        this.db,
        this.env,
        this.config,
      );

      try {
        timer.start("context");
        const built = await contextBuilder.build({
          userId: context.userId,
          conversationId: parsed.data.conversationId,
          userMessageId: userMessage.id,
          userMessage: parsed.data.message,
          timeZone,
          registry,
        });
        metrics.observe("agent.context_ms", timer.end("context"));

        log?.info(
          {
            runId: run.id,
            recentMessageCount: built.recentMessageCount,
            historicalMessageCount: built.historicalMessageCount,
            factCount: built.factCount,
            researchSnapshotCount: built.researchSnapshotCount,
            dateIntent: built.dateIntent?.label ?? null,
          },
          "Context retrieval completed",
        );

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
            log?.info(
              {
                runId: run.id,
                isComparison: true,
                referenceType: temporalPrepare.intent.referenceType,
                startDate: temporalPrepare.intent.startDate,
                historicalSnapshotCount:
                  temporalPrepare.historicalSnapshotIds.length,
                needsCurrentResearch: temporalPrepare.needsCurrentResearch,
              },
              "Temporal intent resolved",
            );
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
        const responses =
          this.options.responsesClient ??
          new OpenAiResponsesClient(this.env, this.config);

        let usage = { inputTokens: 0, outputTokens: 0 };
        let previousResponseId: string | null = null;
        let toolChoice: "auto" | "none" = "auto";
        let iterations = 0;
        let finalTextParsed = false;
        let answerText = "";
        let citations = registry.list().slice(0, 0);
        let comparisonInjected = false;
        let evidenceInjected = false;
        let verificationStatuses: ClaimVerificationOutcome["status"][] = [];
        const chainResponses = resolveLlmProvider(this.env).supportsPreviousResponseId;
        const transcript = new TurnTranscript(promptText);

        // Initial request
        let response = await responses.create({
          model: this.config.model,
          maxOutputTokens: this.config.maxOutputTokens,
          toolChoice,
          input: transcript.snapshot(),
        });
        previousResponseId = chainResponses ? response.id : null;
        usage = accumulateUsage(usage, response);

        while (iterations <= this.config.maxToolIterations) {
          budget.assertNotTimedOut();
          const calls = extractFunctionCalls(response);

          if (calls.length === 0) {
            if (
              temporalPrepare?.intent.isComparison &&
              !comparisonInjected
            ) {
              const comparison = await this.temporal.finalizeComparison({
                userId: context.userId,
                conversationId: parsed.data.conversationId,
                agentRunId: run.id,
                prepare: temporalPrepare,
                currentSnapshotIds: turnSnapshotIds,
              });
              comparisonInjected = true;
              if (comparison) {
                const comparisonMessage = `${comparison.promptBlock}\n\nExplain this comparison for the user. Use only available evidence. Disclose limitations.`;
                if (!chainResponses) {
                  transcript.appendUserMessage(comparisonMessage);
                }
                response = await responses.create({
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
                });
                if (chainResponses) {
                  previousResponseId = response.id;
                }
                usage = accumulateUsage(usage, response);
                continue;
              }
            }

            const rawFinal = parseFinalAnswer(response);
            const validated = this.finalizeAnswerWithEvidence({
              rawFinal,
              registry,
              verificationStatuses,
              log,
            });
            answerText = validated.answer;
            citations = validated.citations;
            finalTextParsed = true;
            break;
          }

          if (!budget.canCallTool() || budget.searchCalls >= this.config.maxSearchesPerTurn) {
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
            response = await responses.create({
              model: this.config.model,
              maxOutputTokens: this.config.maxOutputTokens,
              previousResponseId: chainResponses ? previousResponseId : null,
              toolChoice: "none",
              input: chainResponses
                ? [
                    {
                      role: "user",
                      content: budgetMessage,
                    },
                  ]
                : transcript.snapshot(),
            });
            if (chainResponses) {
              previousResponseId = response.id;
            }
            usage = accumulateUsage(usage, response);
            const rawFinal = parseFinalAnswer(response);
            const validated = this.finalizeAnswerWithEvidence({
              rawFinal,
              registry,
              verificationStatuses,
              log,
            });
            answerText = validated.answer;
            citations = validated.citations;
            finalTextParsed = true;
            break;
          }

          const handled = await functionHandler.handleAll(calls, {
            userId: context.userId,
            conversationId: parsed.data.conversationId,
            requestId: context.requestId,
          });

          for (const item of handled) {
            const snapshotId = extractSnapshotId(item.output);
            if (snapshotId) {
              turnSnapshotIds.push(snapshotId);
            }
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

          // After searches: extract claims + run internal evidence intelligence
          // in the same Responses turn (no extra model-exposed tool).
          // Skip on OpenRouter/free — verification is too slow for the turn budget.
          if (
            this.evidence.enabled &&
            chainResponses &&
            !evidenceInjected &&
            turnSnapshotIds.length > 0
          ) {
            const evidenceBlock = await this.runEvidenceIntelligence({
              userId: context.userId,
              snapshotIds: turnSnapshotIds,
              registry,
              log,
            });
            evidenceInjected = true;
            verificationStatuses = evidenceBlock.statuses;
            toolOutputs.push({
              role: "user",
              content: `${evidenceBlock.briefing}\n\nUse this evidence assessment when answering. Disclose conflicts, outdated sources, and insufficient evidence. Cite only registered evidence IDs.`,
            });
          }

          if (!chainResponses) {
            transcript.appendFunctionCalls(
              calls.map((call) => ({
                callId: call.call_id,
                name: call.name,
                arguments: call.arguments,
              })),
            );
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
          }
          response = await responses.create({
            model: this.config.model,
            maxOutputTokens: this.config.maxOutputTokens,
            previousResponseId: chainResponses ? previousResponseId : null,
            toolChoice: budget.canCallTool() ? "auto" : "none",
            input: chainResponses ? toolOutputs : transcript.snapshot(),
          });
          if (chainResponses) {
            previousResponseId = response.id;
          }
          usage = accumulateUsage(usage, response);
        }

        if (!finalTextParsed) {
          let forceMessage =
            "Maximum tool iterations reached. Produce a final answer using available evidence only. Disclose limitations.";
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
              forceMessage = `${comparison.promptBlock}\n\n${forceMessage}`;
            }
          }
          // Force final synthesis without tools
          if (!chainResponses) {
            transcript.appendUserMessage(forceMessage);
          }
          response = await responses.create({
            model: this.config.model,
            maxOutputTokens: this.config.maxOutputTokens,
            previousResponseId: chainResponses ? previousResponseId : null,
            toolChoice: "none",
            input: chainResponses
              ? [
                  {
                    role: "user",
                    content: forceMessage,
                  },
                ]
              : transcript.snapshot(),
          });
          usage = accumulateUsage(usage, response);
          const rawFinal = parseFinalAnswer(response);
          const validated = this.finalizeAnswerWithEvidence({
            rawFinal,
            registry,
            verificationStatuses,
            log,
          });
          answerText = validated.answer;
          citations = validated.citations;
        }

        const assistantMessage = await this.messages.insert({
          conversationId: parsed.data.conversationId,
          role: "assistant",
          content: answerText,
          metadata: {
            type: "final_answer",
            runId: run.id,
            citations: citations.map((item) => item.evidenceId),
          },
        });

        if (shouldAutoTitle(conversation.title)) {
          await this.conversations.updateForUser(
            parsed.data.conversationId,
            context.userId,
            { title: titleFromUserMessage(parsed.data.message) },
          );
        }

        const durationMs = Date.now() - startedAt;
        const stageSnap = timer.snapshot();
        metrics.observe("agent.total_ms", durationMs);
        metrics.observe("agent.openai_tokens_in", usage.inputTokens || 0);
        metrics.observe("agent.openai_tokens_out", usage.outputTokens || 0);
        metrics.increment("agent.completed");
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

        log?.info(
          {
            runId: run.id,
            durationMs,
            toolCallCount: budget.toolIterations,
            searchCallCount: budget.searchCalls,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            stages: stageSnap.stages,
            totalMs: stageSnap.totalMs,
            timeToFirstTokenMs: stageSnap.timeToFirstTokenMs,
          },
          "Agent turn completed",
        );

        void this.maybeProcessMemory(parsed.data.conversationId, context.userId, log);

        return {
          runId: run.id,
          conversationId: parsed.data.conversationId,
          answer: answerText,
          citations,
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
        };
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        const category =
          error instanceof AgentError ? error.code : "AGENT_PROVIDER_ERROR";
        const message =
          error instanceof Error ? error.message : "Agent turn failed";

        await this.runs.update(run.id, {
          status: "failed",
          toolCallCount: 0,
          searchCallCount: 0,
          completedAt: new Date(),
          durationMs,
          errorCategory: category,
          errorMessage: message,
        });

        log?.error(
          {
            runId: run.id,
            errorCategory: category,
            durationMs,
          },
          "Agent turn failed",
        );

        throw error;
      }
    }),
    ); // gate.withAgentRun
  }

  private async runEvidenceIntelligence(input: {
    userId: string;
    snapshotIds: string[];
    registry: CitationRegistry;
    log?: FastifyBaseLogger;
  }): Promise<{
    briefing: string;
    statuses: ClaimVerificationOutcome["status"][];
  }> {
    const uniqueSnapshotIds = [...new Set(input.snapshotIds)];
    const research = new ResearchRepository(this.db);
    const snapshots = (
      await Promise.all(
        uniqueSnapshotIds.map((id) => research.findSnapshotForUser(id, input.userId)),
      )
    ).filter((s): s is NonNullable<typeof s> => Boolean(s));

    try {
      if (snapshots.length > 0) {
        await this.temporal.extractClaimsForSnapshots({
          userId: input.userId,
          snapshots,
          useOpenAi: false,
        });
      }
    } catch (error) {
      input.log?.warn(
        {
          err:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: "claim extract failed" },
        },
        "Evidence claim extraction skipped",
      );
    }

    try {
      const result = await this.evidence.evaluateClaimsForSnapshots({
        userId: input.userId,
        snapshotIds: uniqueSnapshotIds,
      });

      // Register verified claim evidence into the existing citation registry.
      for (const outcome of result.verificationOutcomes) {
        for (const link of outcome.links) {
          if (
            link.relationship === "supports" ||
            link.relationship === "partially_supports" ||
            link.relationship === "contradicts"
          ) {
            const evidenceId = `claim_${outcome.claimId.slice(0, 8)}_${link.sourceId.slice(0, 8)}`;
            if (!input.registry.has(evidenceId)) {
              input.registry.register({
                evidenceId,
                sourceType: "historical_research_claim",
                title: `Claim evidence ${outcome.claimId}`,
                contentExcerpt: link.evidenceExcerpt.slice(0, 400),
                url: null,
                domain: null,
                sourceMessageId: null,
                sourceFactId: null,
                sourceId: link.sourceId,
                snapshotId: uniqueSnapshotIds[0] ?? null,
                observedAt: new Date().toISOString(),
                publishedAt: null,
                retrievedAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      return {
        briefing: result.evidenceBriefing,
        statuses: result.verificationOutcomes.map((o) => o.status),
      };
    } catch (error) {
      input.log?.warn(
        {
          err:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: "evidence evaluation failed" },
        },
        "Evidence evaluation skipped",
      );
      return {
        briefing:
          "Evidence verification unavailable for this turn. Disclose uncertainty.",
        statuses: [],
      };
    }
  }

  private finalizeAnswerWithEvidence(input: {
    rawFinal: ReturnType<typeof parseFinalAnswer>;
    registry: CitationRegistry;
    verificationStatuses: ClaimVerificationOutcome["status"][];
    log?: FastifyBaseLogger;
  }) {
    const validated = validateAndSanitizeAnswer(input.rawFinal, input.registry);
    const quality = this.evidence.validateFinalAnswer({
      raw: {
        answer: validated.answer,
        citations: validated.citations.map((c) => c.evidenceId),
      },
      registry: input.registry,
      verificationStatuses: input.verificationStatuses,
      persistedUrls: input.registry
        .list()
        .map((r) => r.url)
        .filter((u): u is string => Boolean(u)),
    });

    if (!quality.quality.ok) {
      input.log?.warn(
        { issues: quality.quality.issues },
        "Answer quality validation issues",
      );
      const limitationNote =
        "\n\nNote: Some assertions could not be fully validated against persisted evidence.";
      if (
        quality.quality.issues.some((i) => i.severity === "error") &&
        !validated.answer.includes("could not be fully validated")
      ) {
        return {
          answer: `${validated.answer}${limitationNote}`,
          citations: validated.citations,
          removedCitationIds: validated.removedCitationIds,
        };
      }
    }

    return validated;
  }

  private async maybeProcessMemory(
    conversationId: string,
    userId: string,
    log?: FastifyBaseLogger,
  ): Promise<void> {
    if (!this.config.memoryProcessEnabled) {
      return;
    }

    try {
      const uncovered = await this.messages.listAfterId(
        conversationId,
        (await this.memory.summaries.getLatest(conversationId))?.coveredThroughMessageId ??
          null,
      );
      if (uncovered.length < this.config.memoryProcessAfterMessages) {
        return;
      }
      await this.memory.processConversation(conversationId, userId);
    } catch (error) {
      log?.warn(
        {
          conversationId,
          err:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: "memory process failed" },
        },
        "Memory processing skipped after agent turn",
      );
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
