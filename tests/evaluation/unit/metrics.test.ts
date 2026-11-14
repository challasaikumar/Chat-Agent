import { describe, expect, it } from "vitest";
import {
  meanReciprocalRank,
  ndcgAtK,
  precisionAtK,
  recallAtK,
} from "../../../apps/api/src/evaluation/metrics/retrieval.metrics.ts";
import { summarizeLatencies } from "../../../apps/api/src/evaluation/metrics/latency.metrics.ts";
import {
  citationPrecision,
  citationValidityRate,
} from "../../../apps/api/src/evaluation/metrics/citation.metrics.ts";

describe("evaluation retrieval metrics", () => {
  it("computes precision/recall/mrr and handles zero relevant", () => {
    expect(precisionAtK(["a", "b", "c"], ["b", "d"], 2)).toBe(0.5);
    expect(recallAtK(["a", "b", "c"], ["b", "d"], 2)).toBe(0.5);
    expect(meanReciprocalRank(["a", "b"], ["b"])).toBe(0.5);
    expect(recallAtK(["a"], [], 5)).toBeNull();
    expect(precisionAtK([], ["a"], 5)).toBe(0);
  });

  it("computes ndcg@k", () => {
    const score = ndcgAtK(["a", "b"], { a: 3, b: 2, c: 1 }, 2);
    expect(score).toBeGreaterThan(0.9);
    expect(ndcgAtK([], {}, 5)).toBeNull();
  });
});

describe("evaluation latency metrics", () => {
  it("marks small samples as low confidence", () => {
    const stats = summarizeLatencies([10, 20, 30]);
    expect(stats.medianMs).toBe(20);
    expect(stats.lowConfidence).toBe(true);
    expect(summarizeLatencies([]).averageMs).toBeNull();
  });
});

describe("evaluation citation metrics", () => {
  it("avoids division by zero", () => {
    expect(
      citationPrecision({
        totalCitations: 0,
        validCitations: 0,
        relevantCitations: 0,
        materialClaims: 0,
        citedMaterialClaims: 0,
        unsupportedMaterialClaims: 0,
      }),
    ).toBeNull();
    expect(
      citationValidityRate({
        totalCitations: 2,
        validCitations: 1,
        relevantCitations: 1,
        materialClaims: 1,
        citedMaterialClaims: 1,
        unsupportedMaterialClaims: 0,
      }),
    ).toBe(0.5);
  });
});
