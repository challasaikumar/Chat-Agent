export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  searchCalls: number;
  toolCalls: number;
};

export function emptyUsage(): UsageTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    searchCalls: 0,
    toolCalls: 0,
  };
}

export function averageUsage(
  samples: UsageTotals[],
): Record<string, number | null> {
  if (samples.length === 0) {
    return {
      avgInputTokens: null,
      avgOutputTokens: null,
      avgCachedTokens: null,
      avgSearchCalls: null,
      avgToolCalls: null,
    };
  }
  const n = samples.length;
  return {
    avgInputTokens: samples.reduce((s, x) => s + x.inputTokens, 0) / n,
    avgOutputTokens: samples.reduce((s, x) => s + x.outputTokens, 0) / n,
    avgCachedTokens: samples.reduce((s, x) => s + x.cachedTokens, 0) / n,
    avgSearchCalls: samples.reduce((s, x) => s + x.searchCalls, 0) / n,
    avgToolCalls: samples.reduce((s, x) => s + x.toolCalls, 0) / n,
  };
}
