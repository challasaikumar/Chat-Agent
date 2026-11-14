import { describe, expect, it } from "vitest";
import { describeDb } from "../../helpers/db.ts";
import { runEvaluation } from "../../../apps/api/src/evaluation/evaluation.runner.ts";
import { loadEvaluationConfig } from "../../../apps/api/src/evaluation/evaluation.config.ts";
import { loadEnvironment } from "../../../apps/api/src/config/env.ts";
import { compareEvaluationReports } from "../../../apps/api/src/evaluation/reporting/report.diff.ts";

describeDb("evaluation runner smoke", () => {
  it("runs a single deterministic agent case and writes reports", async () => {
    const env = loadEnvironment({
      NODE_ENV: "test",
      EVAL_ENABLED: "true",
      EVAL_LIVE_ENABLED: "false",
      EVAL_REPORT_DIRECTORY: "reports/evaluations",
    });
    const config = loadEvaluationConfig(env);

    const report = await runEvaluation({
      config,
      caseId: "agent-no-search-math",
      mode: "deterministic",
      verbose: false,
      writeReports: true,
    });

    expect(report.summary.totals.executed).toBe(1);
    expect(report.summary.criticalFailures).toBe(0);
    expect(report.results[0]?.status).toBe("passed");
    expect(JSON.stringify(report)).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);

    const again = await runEvaluation({
      config,
      caseId: "agent-no-search-math",
      mode: "deterministic",
      writeReports: true,
    });
    const diff = compareEvaluationReports(report, again);
    expect(diff.newlyFailing).toEqual([]);
  }, 60_000);
});
