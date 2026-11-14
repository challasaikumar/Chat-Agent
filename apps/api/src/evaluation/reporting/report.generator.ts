import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvaluationRunReport } from "../evaluation.types.js";
import {
  redactSecrets,
  toFailuresJson,
  toMetricsJson,
  toResultsJson,
  toSummaryJson,
} from "./report.json.js";
import { toMarkdownReport } from "./report.markdown.js";

function toJunitXml(report: EvaluationRunReport): string {
  const cases = report.results
    .map((r) => {
      const name = `${r.category}.${r.caseId}`;
      if (r.status === "passed") {
        return `<testcase classname="${escapeXml(r.category)}" name="${escapeXml(r.caseId)}" time="${(r.durationMs / 1000).toFixed(3)}" />`;
      }
      if (r.status === "skipped") {
        return `<testcase classname="${escapeXml(r.category)}" name="${escapeXml(r.caseId)}" time="${(r.durationMs / 1000).toFixed(3)}"><skipped /></testcase>`;
      }
      const message = escapeXml(
        r.assertions
          .filter((a) => !a.passed)
          .map((a) => a.explanation)
          .join("; ") || r.error || r.status,
      );
      const tag = r.status === "error" ? "error" : "failure";
      return `<testcase classname="${escapeXml(r.category)}" name="${escapeXml(name)}" time="${(r.durationMs / 1000).toFixed(3)}"><${tag} message="${message}" /></testcase>`;
    })
    .join("\n");

  const failures = report.summary.totals.failed;
  const errors = report.summary.totals.error;
  const skipped = report.summary.totals.skipped;

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="minimi-evaluation" tests="${report.summary.totals.executed}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${(report.summary.durationMs / 1000).toFixed(3)}">
${cases}
</testsuite>
`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function writeEvaluationReports(
  report: EvaluationRunReport,
  reportDirectory: string,
  format: "json" | "markdown" | "junit" | "all" = "all",
): string {
  const dir = join(reportDirectory, report.summary.runId);
  mkdirSync(dir, { recursive: true });

  const safe = redactSecrets(report) as EvaluationRunReport;

  if (format === "json" || format === "all") {
    writeFileSync(
      join(dir, "summary.json"),
      JSON.stringify(toSummaryJson(safe), null, 2),
    );
    writeFileSync(
      join(dir, "results.json"),
      JSON.stringify(toResultsJson(safe), null, 2),
    );
    writeFileSync(
      join(dir, "metrics.json"),
      JSON.stringify(toMetricsJson(safe), null, 2),
    );
    writeFileSync(
      join(dir, "failures.json"),
      JSON.stringify(toFailuresJson(safe), null, 2),
    );
  }

  if (format === "markdown" || format === "all") {
    writeFileSync(join(dir, "summary.md"), toMarkdownReport(safe));
  }

  if (format === "junit" || format === "all") {
    writeFileSync(join(dir, "junit.xml"), toJunitXml(safe));
  }

  return dir;
}
