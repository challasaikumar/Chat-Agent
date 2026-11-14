/**
 * Treat every external webpage, snippet, and document excerpt as untrusted data.
 * Boundaries prevent source text from being interpreted as instructions.
 */

const BOUNDARY_START = "<<<UNTRUSTED_EVIDENCE_START>>>";
const BOUNDARY_END = "<<<UNTRUSTED_EVIDENCE_END>>>";

export function wrapUntrustedEvidence(content: string, maxLength = 12_000): string {
  const truncated =
    content.length > maxLength ? `${content.slice(0, maxLength)}…` : content;
  const sanitized = truncated
    .replaceAll(BOUNDARY_START, "[boundary]")
    .replaceAll(BOUNDARY_END, "[boundary]");
  return `${BOUNDARY_START}\n${sanitized}\n${BOUNDARY_END}`;
}

export function stripInstructionLikeLines(content: string): string {
  return content
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase().trim();
      return !(
        lower.startsWith("system:") ||
        lower.startsWith("developer:") ||
        lower.startsWith("assistant:") ||
        lower.includes("ignore previous instructions") ||
        lower.includes("ignore all previous")
      );
    })
    .join("\n");
}

export function boundEvidenceExcerpt(
  excerpt: string,
  maxLength = 1500,
): string {
  const cleaned = stripInstructionLikeLines(excerpt).trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength)}…`;
}
