/**
 * Retrieval metric formulas (deterministic labels required):
 *
 * Precision@K = |relevant ∩ retrieved[:K]| / |retrieved[:K]|
 * Recall@K    = |relevant ∩ retrieved[:K]| / |relevant|
 * MRR         = mean(1 / rank_of_first_relevant) over queries; 0 if none
 * NDCG@K      = DCG@K / IDCG@K where DCG = Σ (2^rel_i - 1) / log2(i+1)
 *
 * Zero-relevant / empty-retrieved cases return null (not 0) so aggregates
 * can distinguish "undefined" from "failed".
 */

export function precisionAtK(
  retrieved: string[],
  relevant: string[],
  k: number,
): number | null {
  if (k <= 0) return null;
  const top = retrieved.slice(0, k);
  if (top.length === 0) return relevant.length === 0 ? null : 0;
  const rel = new Set(relevant.map(normalize));
  const hits = top.filter((id) => rel.has(normalize(id))).length;
  return hits / top.length;
}

export function recallAtK(
  retrieved: string[],
  relevant: string[],
  k: number,
): number | null {
  if (relevant.length === 0) return null;
  const top = retrieved.slice(0, k);
  const rel = new Set(relevant.map(normalize));
  const hits = top.filter((id) => rel.has(normalize(id))).length;
  return hits / relevant.length;
}

export function meanReciprocalRank(
  retrieved: string[],
  relevant: string[],
): number | null {
  if (relevant.length === 0) return null;
  const rel = new Set(relevant.map(normalize));
  const idx = retrieved.findIndex((id) => rel.has(normalize(id)));
  if (idx < 0) return 0;
  return 1 / (idx + 1);
}

export function ndcgAtK(
  retrieved: string[],
  relevanceGrades: Record<string, number>,
  k: number,
): number | null {
  if (k <= 0) return null;
  const top = retrieved.slice(0, k);
  if (top.length === 0) return Object.keys(relevanceGrades).length === 0 ? null : 0;

  const dcg = top.reduce((sum, id, i) => {
    const rel = relevanceGrades[id] ?? relevanceGrades[normalize(id)] ?? 0;
    return sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }, 0);

  const ideal = Object.values(relevanceGrades)
    .sort((a, b) => b - a)
    .slice(0, k);
  if (ideal.length === 0 || ideal.every((v) => v === 0)) return null;

  const idcg = ideal.reduce(
    (sum, rel, i) => sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2),
    0,
  );
  if (idcg === 0) return null;
  return dcg / idcg;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

export const RETRIEVAL_METRIC_FORMULAS = {
  precisionAtK:
    "Precision@K = |relevant ∩ retrieved[:K]| / max(1, |retrieved[:K]|); null if K<=0",
  recallAtK:
    "Recall@K = |relevant ∩ retrieved[:K]| / |relevant|; null if no relevant items",
  mrr: "MRR = 1/rank of first relevant item; 0 if none; null if no relevant labels",
  ndcgAtK:
    "NDCG@K = DCG@K / IDCG@K; DCG = Σ (2^rel - 1)/log2(i+1); null if no positive ideal",
} as const;
