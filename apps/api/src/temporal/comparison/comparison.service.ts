import type { AppDatabase } from "../../db/index.js";
import type { ResearchClaim } from "../../db/schema.js";
import type { TemporalConfig } from "../temporal.config.js";
import { ComparisonEngine } from "./comparison.engine.js";
import { TemporalRepository } from "../temporal.repository.js";
import type { TemporalComparisonView } from "../temporal.types.js";

export class ComparisonService {
  private readonly engine = new ComparisonEngine();
  private readonly repo: TemporalRepository;

  constructor(
    db: AppDatabase,
    private readonly config: TemporalConfig,
  ) {
    this.repo = new TemporalRepository(db);
  }

  async runAndPersist(options: {
    userId: string;
    conversationId: string;
    agentRunId?: string | null;
    entityId?: string | null;
    comparisonType: string;
    referenceFrom: string | null;
    referenceTo: string;
    timeZone: string;
    historical: ResearchClaim[];
    current: ResearchClaim[];
    baselineDate: Date | null;
  }): Promise<TemporalComparisonView> {
    const historical = options.historical.slice(
      0,
      this.config.maxClaimsPerComparison,
    );
    const current = options.current.slice(0, this.config.maxClaimsPerComparison);

    const result = this.engine.compare({
      historical,
      current,
      baselineDate: options.baselineDate,
    });

    const persisted = await this.repo.createComparison({
      userId: options.userId,
      conversationId: options.conversationId,
      agentRunId: options.agentRunId,
      entityId: options.entityId,
      comparisonType: options.comparisonType,
      referenceFrom: options.referenceFrom,
      referenceTo: options.referenceTo,
      timeZone: options.timeZone,
      result,
      metadata: {
        historicalClaimCount: historical.length,
        currentClaimCount: current.length,
      },
    });

    return {
      comparisonId: persisted.comparison.id,
      status: persisted.comparison.status,
      confidence: persisted.comparison.confidence,
      verdict: result.verdict,
      resultSummary: persisted.comparison.resultSummary,
      items: persisted.items.map((item) => ({
        attribute: item.attribute,
        category: item.category,
        changeType: item.changeType,
        historicalValue: item.historicalValue,
        currentValue: item.currentValue,
        absoluteDifference: item.absoluteDifference,
        percentageDifference: item.percentageDifference,
        currency: item.currency,
        billingPeriod: item.billingPeriod,
        confidence: item.confidence,
      })),
      promptBlock: formatComparisonPrompt(result.verdict, persisted.comparison.resultSummary, persisted.items),
    };
  }
}

function formatComparisonPrompt(
  verdict: string,
  summary: string,
  items: Array<{
    changeType: string;
    historicalValue: string | null;
    currentValue: string | null;
    absoluteDifference: string | null;
    percentageDifference: string | null;
    currency: string | null;
    billingPeriod: string | null;
    confidence: string;
    attribute: string;
  }>,
): string {
  const lines = [
    "## Deterministic temporal comparison result",
    `Verdict: ${verdict}`,
    summary,
    "Use these backend-calculated deltas. Do not recalculate monetary differences.",
    "Distinguish CONFIRMED CHANGE vs SUPPORTED NO CHANGE vs NOT COMPARABLE vs INSUFFICIENT HISTORICAL EVIDENCE.",
    "Never say 'unchanged' merely because search found nothing — say 'no change detected in the available evidence' when incomplete.",
    "",
    "Items:",
  ];

  for (const item of items.slice(0, 40)) {
    lines.push(
      `- [${item.changeType}] ${item.attribute}: hist=${item.historicalValue ?? "null"} curr=${item.currentValue ?? "null"} Δ=${item.absoluteDifference ?? "n/a"} (${item.percentageDifference ?? "n/a"}%) ${item.currency ?? ""} ${item.billingPeriod ?? ""} confidence=${item.confidence}`,
    );
  }

  return lines.join("\n");
}
