import type { FinalAnswer } from "../agent.schemas.js";
import type { CitationRegistry } from "./citation.registry.js";
import type { EvidenceRecord } from "./citation.types.js";

const REF_RE = /\[ref:([a-zA-Z0-9_:-]+)\]/g;

export type ValidatedFinalAnswer = {
  answer: string;
  citations: EvidenceRecord[];
  removedCitationIds: string[];
};

export function validateAndSanitizeAnswer(
  raw: FinalAnswer,
  registry: CitationRegistry,
): ValidatedFinalAnswer {
  const inlineIds = [...raw.answer.matchAll(REF_RE)].map((match) => match[1]!);
  const combined = [...raw.citations, ...inlineIds];
  const { valid, invalid } = registry.resolve(combined);

  let answer = raw.answer;
  for (const id of invalid) {
    answer = answer.replaceAll(`[ref:${id}]`, "");
  }
  // Preserve markdown structure (headings, lists, tables). Only tidy
  // horizontal runs of spaces/tabs — never collapse newlines.
  answer = answer
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    answer,
    citations: valid,
    removedCitationIds: invalid,
  };
}
