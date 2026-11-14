#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEvaluationConfig } from "./evaluation.config.js";
import { runEvaluation } from "./evaluation.runner.js";
import {
  compareEvaluationReports,
  hasHardGateRegression,
} from "./reporting/report.diff.js";
import { writeEvaluationReports } from "./reporting/report.generator.js";
import type { EvaluationRunReport } from "./evaluation.types.js";
import { runLiveEvaluation } from "./live/live-evaluation.runner.js";

type Args = {
  command: string;
  dataset?: string;
  caseId?: string;
  category?: string;
  limit?: number;
  format?: "json" | "markdown" | "junit" | "all";
  baseline?: string;
  runId?: string;
  verbose?: boolean;
  help?: boolean;
};

function parseArgs(argv: string[]): Args {
  const [command = "eval", ...rest] = argv;
  const args: Args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    const next = rest[i + 1];
    switch (token) {
      case "--dataset":
        args.dataset = next;
        i += 1;
        break;
      case "--case":
        args.caseId = next;
        i += 1;
        break;
      case "--category":
        args.category = next;
        i += 1;
        break;
      case "--limit":
        args.limit = Number(next);
        i += 1;
        break;
      case "--format":
        args.format = next as Args["format"];
        i += 1;
        break;
      case "--baseline":
        args.baseline = next;
        i += 1;
        break;
      case "--run-id":
        args.runId = next;
        i += 1;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unknown argument: ${token}`);
        }
    }
  }
  if (args.limit != null && (!Number.isFinite(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  if (
    args.format &&
    !["json", "markdown", "junit", "all"].includes(args.format)
  ) {
    throw new Error("--format must be json|markdown|junit|all");
  }
  return args;
}

function printHelp() {
  process.stdout.write(`Minimi evaluation CLI

Commands:
  eval                 Deterministic benchmark (no live APIs)
  eval:memory          conversational_memory + historical_retrieval
  eval:temporal        temporal_research
  eval:evidence        evidence_verification + citation_accuracy
  eval:agent           agent_orchestration
  eval:integration     integration mode cases
  eval:live            Live OpenAI/Tavily (requires EVAL_LIVE_ENABLED=true)
  eval:report          Regenerate report for --run-id
  eval:compare         Compare --baseline and --run-id

Options:
  --dataset <name>  --case <id>  --category <cat>  --limit <n>
  --format <json|markdown|junit|all>  --baseline <runId>  --run-id <runId>
  --verbose  --help
`);
}

function loadReport(reportDir: string, runId: string): EvaluationRunReport {
  const dir = join(reportDir, runId);
  const summary = JSON.parse(
    readFileSync(join(dir, "summary.json"), "utf8"),
  ) as EvaluationRunReport["summary"];
  const results = JSON.parse(
    readFileSync(join(dir, "results.json"), "utf8"),
  ) as EvaluationRunReport["results"];
  const metrics = JSON.parse(
    readFileSync(join(dir, "metrics.json"), "utf8"),
  ) as EvaluationRunReport["metrics"];
  const failures = JSON.parse(
    readFileSync(join(dir, "failures.json"), "utf8"),
  ) as EvaluationRunReport["failures"];
  return { summary, results, metrics, failures };
}

function latestRunId(reportDir: string): string | null {
  if (!existsSync(reportDir)) return null;
  const dirs = readdirSync(reportDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs[dirs.length - 1] ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const config = loadEvaluationConfig();
  const categoryByCommand: Record<string, string | undefined> = {
    eval: undefined,
    "eval:memory": "conversational_memory",
    "eval:temporal": "temporal_research",
    "eval:evidence": "evidence_verification",
    "eval:agent": "agent_orchestration",
    "eval:integration": undefined,
  };

  if (args.command === "eval:live") {
    const report = await runLiveEvaluation({
      dataset: args.dataset,
      caseId: args.caseId,
      category: args.category,
      limit: args.limit,
      verbose: args.verbose,
      format: args.format,
    });
    printSummary(report);
    process.exit(report.summary.criticalFailures > 0 ? 1 : 0);
  }

  if (args.command === "eval:report") {
    const runId = args.runId ?? latestRunId(config.reportDirectory);
    if (!runId) throw new Error("No evaluation run found; pass --run-id");
    const report = loadReport(config.reportDirectory, runId);
    const dir = writeEvaluationReports(
      report,
      config.reportDirectory,
      args.format ?? "all",
    );
    process.stdout.write(`Wrote reports to ${dir}\n`);
    process.exit(0);
  }

  if (args.command === "eval:compare") {
    const currentId = args.runId ?? latestRunId(config.reportDirectory);
    if (!args.baseline || !currentId) {
      throw new Error("eval:compare requires --baseline and --run-id");
    }
    const baseline = loadReport(config.reportDirectory, args.baseline);
    const current = loadReport(config.reportDirectory, currentId);
    const diff = compareEvaluationReports(baseline, current);
    process.stdout.write(JSON.stringify(diff, null, 2) + "\n");
    const hard = hasHardGateRegression(diff, current);
    process.exit(hard ? 1 : 0);
  }

  const category =
    args.category ??
    (args.command === "eval:memory"
      ? undefined
      : categoryByCommand[args.command]);

  const mode =
    args.command === "eval:integration"
      ? ("integration" as const)
      : ("deterministic" as const);

  // eval:memory runs both memory categories
  if (args.command === "eval:memory") {
    const memory = await runEvaluation({
      category: "conversational_memory",
      dataset: args.dataset,
      caseId: args.caseId,
      limit: args.limit,
      format: args.format,
      verbose: args.verbose,
      mode: "deterministic",
    });
    const historical = await runEvaluation({
      category: "historical_retrieval",
      dataset: args.dataset,
      caseId: args.caseId,
      limit: args.limit,
      format: args.format,
      verbose: args.verbose,
      mode: "deterministic",
    });
    const combinedCritical =
      memory.summary.criticalFailures + historical.summary.criticalFailures;
    printSummary(memory);
    printSummary(historical);
    process.exit(combinedCritical > 0 ? 1 : 0);
  }

  if (args.command === "eval:evidence") {
    const evidence = await runEvaluation({
      category: "evidence_verification",
      mode: "deterministic",
      dataset: args.dataset,
      caseId: args.caseId,
      limit: args.limit,
      format: args.format,
      verbose: args.verbose,
    });
    const citations = await runEvaluation({
      category: "citation_accuracy",
      mode: "deterministic",
      dataset: args.dataset,
      caseId: args.caseId,
      limit: args.limit,
      format: args.format,
      verbose: args.verbose,
    });
    printSummary(evidence);
    printSummary(citations);
    process.exit(
      evidence.summary.criticalFailures + citations.summary.criticalFailures > 0
        ? 1
        : 0,
    );
  }

  if (!(args.command in categoryByCommand) && args.command !== "eval") {
    throw new Error(`Unknown command: ${args.command}`);
  }

  const report = await runEvaluation({
    category,
    mode,
    dataset: args.dataset,
    caseId: args.caseId,
    limit: args.limit,
    format: args.format,
    verbose: args.verbose,
  });
  printSummary(report);
  process.exit(report.summary.criticalFailures > 0 ? 1 : 0);
}

function printSummary(report: EvaluationRunReport) {
  const s = report.summary;
  process.stdout.write(
    `\n[${s.mode}] ${s.datasetName} run=${s.runId}\n` +
      `  passed=${s.totals.passed} failed=${s.totals.failed} error=${s.totals.error} skipped=${s.totals.skipped}\n` +
      `  success=${(s.totals.successRate * 100).toFixed(1)}% criticalFailures=${s.criticalFailures}\n` +
      `  reports=${join(loadEvaluationConfig().reportDirectory, s.runId)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `Evaluation failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
