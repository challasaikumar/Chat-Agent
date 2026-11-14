import type { CitationRegistry } from "../../agent/citations/citation.registry.js";
import type { EvidenceRecord } from "../../agent/citations/citation.types.js";
import { findFabricatedUrls } from "../security/source-url.validator.js";

export type EvidenceCitationValidation = {
  valid: EvidenceRecord[];
  invalidIds: string[];
  fabricatedUrls: string[];
  ownershipFailures: string[];
  relevanceFailures: string[];
};

/**
 * Extends Phase 04 CitationRegistry validation — does not duplicate the registry.
 */
export function validateEvidenceCitations(input: {
  citationIds: string[];
  registry: CitationRegistry;
  userId: string;
  ownedEvidenceIds: Set<string>;
  persistedUrls: Iterable<string>;
  answerText?: string;
  claimExcerptByEvidenceId?: Map<string, string>;
}): EvidenceCitationValidation {
  const { valid, invalid } = input.registry.resolve(input.citationIds);
  const ownershipFailures: string[] = [];
  const relevanceFailures: string[] = [];
  const ownedValid: EvidenceRecord[] = [];

  for (const record of valid) {
    if (!input.ownedEvidenceIds.has(record.evidenceId)) {
      ownershipFailures.push(record.evidenceId);
      continue;
    }
    if (record.url) {
      const urls = [...input.persistedUrls].map((u) => u.toLowerCase());
      if (!urls.includes(record.url.toLowerCase()) && record.sourceType === "web_search") {
        // Registry-backed web citations must map to persisted URLs.
        ownershipFailures.push(record.evidenceId);
        continue;
      }
    }
    const excerpt = input.claimExcerptByEvidenceId?.get(record.evidenceId);
    if (
      excerpt &&
      record.contentExcerpt &&
      !sharesToken(excerpt, record.contentExcerpt)
    ) {
      relevanceFailures.push(record.evidenceId);
    }
    ownedValid.push(record);
  }

  const fabricatedUrls = input.answerText
    ? findFabricatedUrls(input.answerText, input.persistedUrls)
    : [];

  return {
    valid: ownedValid,
    invalidIds: invalid,
    fabricatedUrls,
    ownershipFailures,
    relevanceFailures,
  };
}

function sharesToken(a: string, b: string): boolean {
  const ta = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );
  const bl = b.toLowerCase();
  let hits = 0;
  for (const token of ta) {
    if (bl.includes(token)) {
      hits += 1;
    }
    if (hits >= 2) {
      return true;
    }
  }
  return hits >= 1 && ta.size <= 3;
}
