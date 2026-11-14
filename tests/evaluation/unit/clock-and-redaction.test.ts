import { describe, expect, it } from "vitest";
import {
  FixedClock,
  createFixedClock,
} from "../../../apps/api/src/evaluation/fixtures/fixture.clock.ts";
import { redactSecrets } from "../../../apps/api/src/evaluation/reporting/report.json.ts";
import { assertLiveEvaluationAllowed } from "../../../apps/api/src/evaluation/live/live-evaluation.config.ts";
import { loadEvaluationConfig } from "../../../apps/api/src/evaluation/evaluation.config.ts";
import { loadEnvironment } from "../../../apps/api/src/config/env.ts";

describe("evaluation clock", () => {
  it("returns fixed timestamp", () => {
    const clock = createFixedClock("2026-11-13T06:30:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-11-13T06:30:00.000Z");
    expect(() => new FixedClock(new Date("nope"))).toThrow();
  });
});

describe("evaluation secret redaction", () => {
  it("redacts keys and token-like strings", () => {
    const redacted = redactSecrets({
      OPENAI_API_KEY: "sk-abc1234567890",
      nested: { authorization: "Bearer x", note: "ok" },
      blob: "prefix sk-abcdefghijklmnop suffix",
    }) as Record<string, unknown>;
    expect(redacted.OPENAI_API_KEY).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).authorization).toBe(
      "[redacted]",
    );
    expect(redacted.blob).toBe("[redacted]");
  });
});

describe("live evaluation opt-in", () => {
  it("blocks live mode when disabled", () => {
    const env = loadEnvironment({ EVAL_LIVE_ENABLED: "false" });
    const config = loadEvaluationConfig(env);
    expect(() => assertLiveEvaluationAllowed(config)).toThrow(/disabled/i);
  });
});
