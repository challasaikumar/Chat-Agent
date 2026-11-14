import type { EvaluationRunReport } from "../evaluation.types.js";

export function toSummaryJson(report: EvaluationRunReport): unknown {
  return report.summary;
}

export function toResultsJson(report: EvaluationRunReport): unknown {
  return report.results;
}

export function toMetricsJson(report: EvaluationRunReport): unknown {
  return report.metrics;
}

export function toFailuresJson(report: EvaluationRunReport): unknown {
  return report.failures;
}

/** Redact any accidental secret-looking fields before persistence. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        /^(api[_-]?key|token|secret|authorization|password|openai_api_key|tavily_api_key)$/i.test(
          k,
        ) ||
        /(_api_key|_token|_secret|_password)$/i.test(k)
      ) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactSecrets(v);
      }
    }
    return out;
  }
  if (typeof value === "string" && /sk-[a-zA-Z0-9]{10,}|tvly-[a-zA-Z0-9]{8,}/.test(value)) {
    return "[redacted]";
  }
  return value;
}
