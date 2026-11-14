import type { GradeAssertion } from "../evaluation.types.js";

export function assertEqual(
  id: string,
  description: string,
  expected: unknown,
  actual: unknown,
  options: {
    critical?: boolean;
    failureCategory?: GradeAssertion["failureCategory"];
    explanation?: string;
  } = {},
): GradeAssertion {
  const passed = Object.is(expected, actual) || JSON.stringify(expected) === JSON.stringify(actual);
  return {
    id,
    description,
    passed,
    expected,
    actual,
    explanation:
      options.explanation ??
      (passed ? "Values match" : `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`),
    failureCategory: passed ? undefined : options.failureCategory ?? "OTHER",
    critical: options.critical ?? true,
  };
}

export function assertIncludes(
  id: string,
  description: string,
  haystack: string,
  needles: string[],
  options: {
    critical?: boolean;
    failureCategory?: GradeAssertion["failureCategory"];
  } = {},
): GradeAssertion {
  const missing = needles.filter(
    (n) => !haystack.toLowerCase().includes(n.toLowerCase()),
  );
  const passed = missing.length === 0;
  return {
    id,
    description,
    passed,
    expected: needles,
    actual: { missing, haystackLength: haystack.length },
    explanation: passed
      ? "All required substrings present"
      : `Missing: ${missing.join(", ")}`,
    failureCategory: passed ? undefined : options.failureCategory ?? "OTHER",
    critical: options.critical ?? true,
  };
}

export function assertExcludes(
  id: string,
  description: string,
  haystack: string,
  forbidden: string[],
  options: {
    critical?: boolean;
    failureCategory?: GradeAssertion["failureCategory"];
  } = {},
): GradeAssertion {
  const found = forbidden.filter((n) =>
    haystack.toLowerCase().includes(n.toLowerCase()),
  );
  const passed = found.length === 0;
  return {
    id,
    description,
    passed,
    expected: { forbidden },
    actual: { found },
    explanation: passed
      ? "No forbidden substrings"
      : `Found forbidden: ${found.join(", ")}`,
    failureCategory: passed ? undefined : options.failureCategory ?? "OTHER",
    critical: options.critical ?? true,
  };
}

export function assertDecimalClose(
  id: string,
  description: string,
  expected: string,
  actual: string | null | undefined,
  tolerance = 0.01,
  options: {
    critical?: boolean;
    failureCategory?: GradeAssertion["failureCategory"];
  } = {},
): GradeAssertion {
  const exp = Number(expected);
  const act = actual == null ? NaN : Number(actual);
  const passed =
    Number.isFinite(exp) &&
    Number.isFinite(act) &&
    Math.abs(exp - act) <= tolerance;
  return {
    id,
    description,
    passed,
    expected,
    actual,
    explanation: passed
      ? `Within tolerance ${tolerance}`
      : `Decimal mismatch (tol=${tolerance})`,
    failureCategory: passed
      ? undefined
      : options.failureCategory ?? "PRICE_NORMALIZATION_FAILURE",
    critical: options.critical ?? true,
  };
}
