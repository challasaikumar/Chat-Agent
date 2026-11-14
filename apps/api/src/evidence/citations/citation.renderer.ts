import type { EvidenceRecord } from "../../agent/citations/citation.types.js";

export type SafeCitationView = {
  ref: string;
  evidenceId: string;
  title: string;
  url: string | null;
  domain: string | null;
  sourceType: string;
  observedAt: string | null;
  publishedAt: string | null;
  excerpt: string;
};

/**
 * Resolve internal evidence IDs into safe metadata for frontend rendering.
 * Never invents citations or silently remaps to a different source.
 */
export function renderSafeCitations(
  records: EvidenceRecord[],
): SafeCitationView[] {
  const seen = new Set<string>();
  const views: SafeCitationView[] = [];

  for (const record of records) {
    if (seen.has(record.evidenceId)) {
      continue;
    }
    seen.add(record.evidenceId);
    views.push({
      ref: `[ref:${record.evidenceId}]`,
      evidenceId: record.evidenceId,
      title: record.title.slice(0, 200),
      url: record.url,
      domain: record.domain,
      sourceType: record.sourceType,
      observedAt: record.observedAt,
      publishedAt: record.publishedAt,
      excerpt: record.contentExcerpt.slice(0, 400),
    });
  }

  return views;
}
