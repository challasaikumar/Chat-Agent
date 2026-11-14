/**
 * Detect follow-ups that should reuse conversation context (no web search).
 * Examples: "show this as a table", "compare them", "format that".
 */
export function isLocalFormatFollowUp(message: string): boolean {
  const text = message.toLowerCase().trim();
  if (!text) return false;

  const patterns = [
    /\b(in|as|to)\s+(a\s+)?table\b/,
    /\btable\s+formate?\b/,
    /\b(show|display|present|put|convert|rewrite|reformat|format)\b.*\b(table|markdown|bullet|list)\b/,
    /\bcompare\s+(it|them|these|this|the\s+(above|previous|last))\b/,
    /\b(make|create)\s+(a\s+)?(comparison\s+)?table\b/,
    /\bsummarise\s+(that|this|it)\b/,
    /\bsummarize\s+(that|this|it)\b/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}
