import { buildApp } from "../app.js";
import { loadEnvironment } from "../config/env.js";
import { inArray } from "drizzle-orm";
import {
  agentRuns,
  conversations as conversationsTable,
  researchClaims,
  researchSources,
} from "../db/schema.js";
import { TemporalService } from "../temporal/temporal.service.js";
import { ConversationService } from "../services/conversation.service.js";
import { analyzeSourceIndependence } from "../evidence/sources/source.independence.js";
import { assessFreshness } from "../evidence/sources/source.freshness.js";
import type { EvaluationCase } from "./evaluation.schemas.js";
import type { EvaluationCaseResult, GradeAssertion, FailureCategory } from "./evaluation.types.js";
import type { EvaluationConfig } from "./evaluation.config.js";
import { loadCaseFixtures } from "./fixtures/fixture.loader.js";
import { gradeTemporalDateResolution, gradeTemporalComparisonView } from "./graders/temporal.grader.js";
import { gradePricingComparisons } from "./graders/pricing.grader.js";
import { gradeMemoryEntities, gradeConversationRecall } from "./graders/memory.grader.js";
import { gradeCitations } from "./graders/citation.grader.js";
import { gradeToolUsage } from "./graders/tool-usage.grader.js";
import { gradeEvidence } from "./graders/evidence.grader.js";
import { gradeAnswerQuality } from "./graders/answer-quality.grader.js";
import { gradePerformanceBudget } from "./graders/performance.grader.js";

export type ExecutableCase = EvaluationCase & {
  datasetName: string;
  datasetVersion: number;
};

function statusFromAssertions(
  assertions: GradeAssertion[],
): EvaluationCaseResult["status"] {
  const criticalFail = assertions.some((a) => a.critical !== false && !a.passed);
  if (criticalFail) return "failed";
  const softFail = assertions.some((a) => !a.passed);
  if (softFail) return "failed";
  return "passed";
}

export async function executeEvaluationCase(
  caseSpec: ExecutableCase,
  config: EvaluationConfig,
): Promise<EvaluationCaseResult> {
  const started = Date.now();
  const timeoutMs = caseSpec.limits.timeoutMs ?? config.defaultTimeoutMs;
  const assertions: GradeAssertion[] = [];
  const metrics: Record<string, number | null> = {};
  const trace = {
    agentRunIds: [] as string[],
    conversationIds: [] as string[],
    snapshotIds: [] as string[],
    notes: [] as string[],
  };

  const fixtures = await loadCaseFixtures(caseSpec);
  const { testDb } = fixtures.db;
  trace.conversationIds.push(...Object.values(fixtures.db.conversationIds));
  trace.snapshotIds.push(...fixtures.db.snapshotIds);

  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  let answerText = "";
  let searchCallCount = 0;
  let toolCallCount = 0;

  try {
    const now = fixtures.clock.now();
    const followUps = caseSpec.conversationSequence;
    const primaryMessage =
      followUps[0]?.message ??
      "Evaluation probe: summarize relevant historical context.";

    // --- Service-level deterministic checks (always) ---
    assertions.push(
      ...gradeTemporalDateResolution(
        primaryMessage,
        caseSpec.expected,
        now,
        fixtures.timeZone,
      ),
    );

    const claimRows = await testDb.db.select().from(researchClaims);
    assertions.push(...gradePricingComparisons(caseSpec.expected, claimRows));

    const entityNames = [
      ...new Set(claimRows.map((c) => c.entityName)),
    ];
    const memoryGrade = gradeMemoryEntities(caseSpec.expected, entityNames);
    assertions.push(...memoryGrade.assertions);
    Object.assign(metrics, memoryGrade.metrics);

    const conversations = new ConversationService(testDb.db);
    const titles: string[] = [];
    const contents: string[] = [];
    for (const id of Object.values(fixtures.db.conversationIds)) {
      try {
        const c = await conversations.get(testDb.localUserId, id);
        titles.push(c.title ?? "");
        const page = await conversations.listMessages(testDb.localUserId, id, {
          limit: 100,
        });
        contents.push(...page.items.map((m) => m.content));
      } catch {
        // ignore non-conversation keys
      }
    }
    assertions.push(
      ...gradeConversationRecall(
        caseSpec.expected,
        titles,
        contents,
        caseSpec.expected.historicalMustContain ?? [],
      ),
    );

    // Temporal comparison when historical + current snapshots exist
    if (fixtures.db.snapshotIds.length >= 1 && caseSpec.expected.changeTypes) {
      const env = loadEnvironment({
        NODE_ENV: "test",
        LOCAL_USER_ID: testDb.localUserId,
        APP_TIME_ZONE: fixtures.timeZone,
      });
      const temporal = new TemporalService(testDb.db, env);
      const conversationId =
        Object.values(fixtures.db.conversationIds)[0] ??
        (await conversations.create(testDb.localUserId, "eval")).id;

      const prepare = await temporal.prepareTurn({
        userId: testDb.localUserId,
        conversationId,
        message: primaryMessage,
        timeZone: fixtures.timeZone,
        now,
      });

      const allSnaps = fixtures.db.snapshotIds;
      const currentIds = allSnaps.slice(-Math.ceil(allSnaps.length / 2));
      const view = await temporal.finalizeComparison({
        userId: testDb.localUserId,
        conversationId,
        prepare,
        currentSnapshotIds: currentIds,
      });
      assertions.push(...gradeTemporalComparisonView(view, caseSpec.expected));
    }

    // Evidence independence / freshness on seeded sources
    if (
      caseSpec.expected.independentSourceMax != null ||
      caseSpec.expected.freshnessCategories?.length
    ) {
      const sourceRows = (
        await testDb.db
          .select({
            id: researchSources.id,
            url: researchSources.url,
            domain: researchSources.domain,
            content: researchSources.contentExcerpt,
            contentHash: researchSources.contentHash,
            publishedAt: researchSources.publishedAt,
            retrievedAt: researchSources.retrievedAt,
          })
          .from(researchSources)
      ).map((row) => ({
        ...row,
        publishedAt: row.publishedAt ? row.publishedAt.getTime() : null,
        retrievedAt: row.retrievedAt.getTime(),
      }));

      const independence = analyzeSourceIndependence(
        sourceRows.map((s) => ({
          id: s.id,
          url: s.url,
          content: s.content,
          contentHash: s.contentHash,
        })),
      );

      const freshnessCats = sourceRows.map(
        (s) =>
          assessFreshness({
            publishedAt: s.publishedAt ? new Date(s.publishedAt) : null,
            retrievedAt: new Date(s.retrievedAt),
            now,
            claimCategory: "pricing",
          }).freshnessCategory,
      );

      const claimStatuses = claimRows.map((c) => c.verificationStatus);
      assertions.push(
        ...gradeEvidence(caseSpec.expected, {
          verificationStatuses: claimStatuses,
          freshnessCategories: freshnessCats,
          independentSourceCount: independence.independentSourceCount,
        }),
      );
    }

    // --- Agent turn path for orchestration / answer / tool metrics ---
    const needsAgent =
      caseSpec.category === "agent_orchestration" ||
      caseSpec.mode === "integration" ||
      Boolean(caseSpec.expected.mustSearch) ||
      Boolean(caseSpec.expected.mustNotSearch) ||
      Boolean(caseSpec.expected.citationsRequired) ||
      followUps.length > 0;

    if (needsAgent) {
      const env = loadEnvironment({
        NODE_ENV: "test",
        LOCAL_USER_ID: testDb.localUserId,
        OPENAI_API_KEY: "sk-eval",
        OPENAI_MODEL: "eval-fixture-model",
        TAVILY_API_KEY: "tvly-eval",
        AGENT_MEMORY_PROCESS_ENABLED: "false",
        APP_TIME_ZONE: fixtures.timeZone,
      });

      app = await buildApp({
        env,
        searchProvider: fixtures.search,
        responsesClient: fixtures.openai,
        database: {
          db: testDb.db,
          databasePath: testDb.path,
          localUserId: testDb.localUserId,
        },
      });

      const seededConversationIds = Object.values(fixtures.db.conversationIds);
      const existingConversation = seededConversationIds.length
        ? (
            await testDb.db
              .select({ id: conversationsTable.id })
              .from(conversationsTable)
              .where(inArray(conversationsTable.id, seededConversationIds))
              .limit(1)
          )[0]
        : undefined;
      let conversationId =
        existingConversation?.id ??
        (
          await app.inject({
            method: "POST",
            url: "/api/conversations",
            payload: { title: `eval-${caseSpec.id}` },
          })
        ).json().data.id;

      for (const step of followUps.length
        ? followUps
        : [{ message: primaryMessage }]) {
        const response = await app.inject({
          method: "POST",
          url: "/api/agent/turn",
          payload: {
            conversationId,
            message: step.message,
            timeZone: fixtures.timeZone,
          },
        });

        if (response.statusCode >= 400) {
          assertions.push({
            id: "agent.http",
            description: "Agent turn HTTP success",
            passed: false,
            expected: 200,
            actual: response.statusCode,
            explanation: response.body.slice(0, 500),
            failureCategory: "TOOL_EXECUTION_FAILURE",
            critical: true,
          });
          break;
        }

        const body = response.json().data as {
          answer?: string;
          runId?: string;
          execution?: { searchCallCount?: number; toolCallCount?: number };
        };
        answerText = body.answer ?? answerText;
        searchCallCount += body.execution?.searchCallCount ?? 0;
        toolCallCount += body.execution?.toolCallCount ?? 0;
        if (body.runId) trace.agentRunIds.push(body.runId);
      }

      // Fallback counts from DB if response omitted
      if (searchCallCount === 0) {
        const runs = await testDb.db.select().from(agentRuns);
        searchCallCount = runs.reduce((s, r) => s + (r.searchCallCount ?? 0), 0);
        toolCallCount = runs.reduce((s, r) => s + (r.toolCallCount ?? 0), 0);
      }

      const toolGrade = gradeToolUsage(caseSpec.expected, {
        searchCallCount,
        toolCallCount,
        maxSearches: caseSpec.expected.maxSearchCalls,
      });
      assertions.push(...toolGrade.assertions);
      Object.assign(metrics, toolGrade.metrics);

      assertions.push(...gradeAnswerQuality(caseSpec.expected, answerText));

      const validIds = new Set(Object.values(fixtures.db.sourceIdsByUrl));
      for (const id of fixtures.db.claimIds) validIds.add(id);
      const citationGrade = gradeCitations(
        caseSpec.expected,
        answerText,
        validIds,
      );
      assertions.push(...citationGrade.assertions);
      Object.assign(metrics, citationGrade.metrics);

      metrics.inputTokens = fixtures.openai.usageTotals.input;
      metrics.outputTokens = fixtures.openai.usageTotals.output;
      metrics.cachedTokens = fixtures.openai.usageTotals.cached;
    }

    const durationMs = Date.now() - started;
    metrics.durationMs = durationMs;
    assertions.push(gradePerformanceBudget(durationMs, timeoutMs));

    if (durationMs > timeoutMs) {
      return finalize(
        caseSpec,
        "error",
        assertions,
        metrics,
        trace,
        durationMs,
        "TIMEOUT",
      );
    }

    return finalize(
      caseSpec,
      statusFromAssertions(assertions),
      assertions,
      metrics,
      trace,
      durationMs,
    );
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : String(error);
    assertions.push({
      id: "case.error",
      description: "Case execution error",
      passed: false,
      expected: "no error",
      actual: message,
      explanation: message,
      failureCategory: message.includes("TIMEOUT")
        ? "TIMEOUT"
        : message.includes("SEARCH_PROVIDER")
          ? "SEARCH_PROVIDER_FAILURE"
          : "OTHER",
      critical: true,
    });
    return finalize(
      caseSpec,
      "error",
      assertions,
      metrics,
      trace,
      durationMs,
      message,
    );
  } finally {
    await app?.close();
    fixtures.cleanup();
  }
}

function finalize(
  caseSpec: ExecutableCase,
  status: EvaluationCaseResult["status"],
  assertions: GradeAssertion[],
  metrics: Record<string, number | null>,
  trace: EvaluationCaseResult["trace"],
  durationMs: number,
  error?: string,
): EvaluationCaseResult {
  const failureCategories = [
    ...new Set(
      assertions
        .filter((a) => !a.passed && a.failureCategory)
        .map((a) => a.failureCategory as FailureCategory),
    ),
  ];

  return {
    caseId: caseSpec.id,
    name: caseSpec.name,
    category: caseSpec.category,
    mode: caseSpec.mode,
    status,
    durationMs,
    assertions,
    metrics,
    failureCategories,
    trace,
    error,
  };
}
