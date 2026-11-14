export function sourceAgeDays(observedAt: Date, now = new Date()): number {
  const ms = now.getTime() - observedAt.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function isStaleSource(
  observedAt: Date,
  maxAgeDays: number,
  now = new Date(),
): boolean {
  return sourceAgeDays(observedAt, now) > maxAgeDays;
}

/**
 * A newer retrieval date alone does not prove a price/feature change.
 */
export function freshnessNote(options: {
  historicalObservedAt: Date;
  currentObservedAt: Date;
}): string {
  return `Historical observed ${options.historicalObservedAt.toISOString()}; current retrieved ${options.currentObservedAt.toISOString()}. Retrieval recency alone is not proof of change.`;
}
