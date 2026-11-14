import type { EvaluationRunReport } from "../evaluation.types.js";

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "n/a";
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null | undefined, digits = 2): string {
  if (n == null) return "n/a";
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

export function toMarkdownReport(report: EvaluationRunReport): string {
  const s = report.summary;
  const byCategory = new Map<string, { passed: number; total: number }>();
  for (const r of report.results) {
    const row = byCategory.get(r.category) ?? { passed: 0, total: 0 };
    row.total += 1;
    if (r.status === "passed") row.passed += 1;
    byCategory.set(r.category, row);
  }

  const failed = report.results.filter(
    (r) => r.status === "failed" || r.status === "error",
  );

  const lines = [
    `# Evaluation Report`,
    ``,
    `## 1. Executive summary`,
    ``,
    `- Run ID: \`${s.runId}\``,
    `- Mode: **${s.mode}**`,
    `- Success rate: **${pct(s.totals.successRate)}** (${s.totals.passed}/${s.totals.executed})`,
    `- Critical failures: **${s.criticalFailures}**`,
    `- Duration: ${s.durationMs} ms`,
    `- Git commit: ${s.gitCommit ?? "n/a"}`,
    ``,
    `## 2. Dataset information`,
    ``,
    `- Dataset: ${s.datasetName}`,
    `- Dataset version: ${s.datasetVersion}`,
    `- Started: ${s.startedAt}`,
    `- Completed: ${s.completedAt}`,
    ``,
    `## 3–7. Case totals`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Executed | ${s.totals.executed} |`,
    `| Passed | ${s.totals.passed} |`,
    `| Failed | ${s.totals.failed} |`,
    `| Skipped | ${s.totals.skipped} |`,
    `| Error | ${s.totals.error} |`,
    `| Cancelled | ${s.totals.cancelled} |`,
    `| Success rate | ${pct(s.totals.successRate)} |`,
    ``,
    `## 8. Per-category metrics`,
    ``,
    `| Category | Passed | Total | Rate |`,
    `| --- | ---: | ---: | ---: |`,
    ...[...byCategory.entries()].map(
      ([cat, row]) =>
        `| ${cat} | ${row.passed} | ${row.total} | ${pct(row.passed / row.total)} |`,
    ),
    ``,
    `## 9. Citation metrics`,
    ``,
    `- Avg citation validity: ${pct(report.metrics.avgCitationValidity as number | null)}`,
    ``,
    `## 10. Retrieval metrics`,
    ``,
    `- Avg entity match: ${pct(report.metrics.avgEntityMatchRate as number | null)}`,
    `- Avg Precision@5: ${pct(report.metrics.avgPrecisionAt5 as number | null)}`,
    `- Avg Recall@5: ${pct(report.metrics.avgRecallAt5 as number | null)}`,
    `- Avg MRR: ${num(report.metrics.avgMrr as number | null)}`,
    ``,
    `## 11. Temporal accuracy`,
    ``,
    `- Covered via deterministic date + pricing graders in temporal_research cases.`,
    ``,
    `## 12. Tool usage metrics`,
    ``,
    `- Avg search calls: ${num(report.metrics.avgSearchCalls as number | null)}`,
    ``,
    `## 13. Latency statistics`,
    ``,
    `- Average: ${num(report.metrics.avgDurationMs as number | null, 0)} ms`,
    `- P50: ${num(report.metrics.p50DurationMs as number | null, 0)} ms`,
    `- P95: ${num(report.metrics.p95DurationMs as number | null, 0)} ms`,
    `- Low-confidence percentiles: ${report.metrics.latencyLowConfidence === 1 ? "yes (n<30)" : "no"}`,
    ``,
    `## 14. Token usage`,
    ``,
    `- Avg input tokens: ${num(report.metrics.avgInputTokens as number | null, 0)}`,
    `- Avg output tokens: ${num(report.metrics.avgOutputTokens as number | null, 0)}`,
    `- Note: fixture usage for deterministic mode; live mode records provider usage.`,
    ``,
    `## 15. Failure analysis`,
    ``,
  ];

  if (failed.length === 0) {
    lines.push(`No failed or errored cases.`);
  } else {
    for (const f of failed) {
      lines.push(`### ${f.caseId} — ${f.status}`);
      lines.push(``);
      lines.push(`- Categories: ${f.failureCategories.join(", ") || "n/a"}`);
      for (const a of f.assertions.filter((x) => !x.passed)) {
        lines.push(
          `- \`${a.id}\`: expected \`${JSON.stringify(a.expected)}\`, actual \`${JSON.stringify(a.actual)}\` — ${a.explanation}`,
        );
      }
      lines.push(``);
    }
  }

  lines.push(
    `## 16. Regression comparison`,
    ``,
    `Use \`npm run eval:compare -- --baseline <runA> --run-id <runB>\`.`,
    ``,
    `## 17. Known evaluation limitations`,
    ``,
    `- Deterministic mode uses mocked OpenAI/Tavily fixtures — not live market prices.`,
    `- LLM-as-judge is optional, disabled by default, and never sole authority for numeric/date facts.`,
    `- Percentile latency stats are low-confidence for small sample sizes.`,
    `- Estimated API costs are not billed amounts.`,
    ``,
  );

  return lines.join("\n");
}
