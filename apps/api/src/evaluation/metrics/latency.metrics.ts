export type LatencyStats = {
  count: number;
  averageMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
  lowConfidence: boolean;
};

export function summarizeLatencies(samplesMs: number[]): LatencyStats {
  if (samplesMs.length === 0) {
    return {
      count: 0,
      averageMs: null,
      medianMs: null,
      p95Ms: null,
      minMs: null,
      maxMs: null,
      lowConfidence: true,
    };
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;
  const p95Index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );

  return {
    count: sorted.length,
    averageMs: sum / sorted.length,
    medianMs: median,
    p95Ms: sorted[Math.max(0, p95Index)]!,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    lowConfidence: sorted.length < 30,
  };
}
