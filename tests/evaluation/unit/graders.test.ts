import { describe, expect, it } from "vitest";
import { createFixedClock } from "../../../apps/api/src/evaluation/fixtures/fixture.clock.ts";
import { gradeTemporalDateResolution } from "../../../apps/api/src/evaluation/graders/temporal.grader.ts";
import { gradeToolUsage } from "../../../apps/api/src/evaluation/graders/tool-usage.grader.ts";
import { gradeCitations } from "../../../apps/api/src/evaluation/graders/citation.grader.ts";
import { gradePricingComparisons } from "../../../apps/api/src/evaluation/graders/pricing.grader.ts";
import type { ResearchClaim } from "../../../apps/api/src/db/schema.ts";
import { llmJudgeResultSchema } from "../../../apps/api/src/evaluation/live/llm-judge.ts";
import { validateDatasetOrThrow } from "../../../apps/api/src/evaluation/evaluation.dataset.loader.ts";

describe("evaluation graders", () => {
  it("resolves fixed-clock Monday and November 3", () => {
    const now = createFixedClock("2026-11-13T12:00:00.000+05:30").now();
    const monday = gradeTemporalDateResolution(
      "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
      { historicalDate: "2026-11-09" },
      now,
      "Asia/Kolkata",
    );
    expect(monday.every((a) => a.passed)).toBe(true);

    const nov3 = gradeTemporalDateResolution(
      "What did I ask you on 3 November?",
      { historicalDate: "2026-11-03" },
      now,
      "Asia/Kolkata",
    );
    expect(nov3.every((a) => a.passed)).toBe(true);
  });

  it("grades search decisions", () => {
    const must = gradeToolUsage(
      { mustSearch: true },
      { searchCallCount: 1, toolCallCount: 1 },
    );
    expect(must.assertions.every((a) => a.passed)).toBe(true);
    const avoid = gradeToolUsage(
      { mustNotSearch: true },
      { searchCallCount: 1, toolCallCount: 1 },
    );
    expect(avoid.assertions.some((a) => !a.passed)).toBe(true);
  });

  it("flags fabricated citations", () => {
    const { assertions } = gradeCitations(
      { citationsRequired: true },
      "Price is $10 [ref:fake_id]",
      new Set(["real_id"]),
    );
    expect(assertions.some((a) => !a.passed && a.id === "citation.invalid")).toBe(
      true,
    );
  });

  it("grades exact pricing deltas", () => {
    const claims = [
      {
        entityName: "HubSpot",
        numericValue: "20.00",
        currency: "USD",
        billingPeriod: "monthly",
        planName: "Pro",
        originalValue: "$20",
        unit: null,
      },
      {
        entityName: "HubSpot",
        numericValue: "30.00",
        currency: "USD",
        billingPeriod: "monthly",
        planName: "Pro",
        originalValue: "$30",
        unit: null,
      },
    ] as ResearchClaim[];

    const assertions = gradePricingComparisons(
      {
        priceComparisons: [
          {
            entity: "HubSpot",
            planName: "Pro",
            historicalValue: "20.00",
            currentValue: "30.00",
            absoluteDifference: "10.00",
            percentageDifference: "50.00",
            changeType: "PRICE_INCREASED",
          },
        ],
      },
      claims,
    );
    expect(assertions.every((a) => a.passed)).toBe(true);
  });

  it("validates llm judge schema", () => {
    const parsed = llmJudgeResultSchema.parse({
      completeness: 0.8,
      clarity: 0.7,
      relevance: 0.9,
      uncertaintyCalibration: 0.6,
      evidenceGrounding: 0.85,
      explanation: "Grounded but incomplete on Render.",
      humanReviewRecommended: true,
    });
    expect(parsed.completeness).toBe(0.8);
  });

  it("validates dataset schema", () => {
    const ds = validateDatasetOrThrow({
      name: "tiny",
      version: 1,
      cases: [
        {
          id: "t1",
          name: "T",
          category: "agent_orchestration",
          mode: "deterministic",
        },
      ],
    });
    expect(ds.cases).toHaveLength(1);
  });
});
