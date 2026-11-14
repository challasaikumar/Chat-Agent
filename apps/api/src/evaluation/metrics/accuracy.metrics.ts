/** Exact-match accuracy over boolean assertion outcomes. */
export function accuracyRate(passed: number, total: number): number | null {
  if (total <= 0) return null;
  return passed / total;
}

export function entityMatchRate(
  expected: string[],
  actual: string[],
): number | null {
  if (expected.length === 0) return null;
  const actualNorm = new Set(actual.map((e) => e.toLowerCase().trim()));
  const hits = expected.filter((e) => actualNorm.has(e.toLowerCase().trim()));
  return hits.length / expected.length;
}
