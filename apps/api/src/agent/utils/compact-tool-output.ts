/**
 * Shrink web_search tool payloads before re-sending them on providers that
 * cannot chain previous_response_id (OpenRouter). Huge JSON dumps blow the
 * context window and free models then return empty / unusable finals.
 */
export function compactToolOutput(
  output: unknown,
  maxChars = 3_500,
): string {
  if (typeof output === "string") {
    return output.length > maxChars
      ? `${output.slice(0, maxChars)}…`
      : output;
  }
  if (!output || typeof output !== "object") {
    return JSON.stringify(output ?? null);
  }

  const record = output as Record<string, unknown>;
  const sourcesRaw = Array.isArray(record.sources) ? record.sources : [];
  const sources = sourcesRaw.slice(0, 6).map((source) => {
    if (!source || typeof source !== "object") return source;
    const item = source as Record<string, unknown>;
    const excerpt =
      typeof item.contentExcerpt === "string"
        ? item.contentExcerpt.slice(0, 280)
        : item.contentExcerpt;
    return {
      title: item.title,
      url: item.url,
      domain: item.domain,
      evidenceId: item.evidenceId ?? item.id,
      contentExcerpt: excerpt,
    };
  });

  const compact: Record<string, unknown> = {
    success: record.success,
    query: record.query,
    snapshotId: record.snapshotId,
    resultCount: sources.length,
    sources,
    note:
      typeof record.note === "string"
        ? record.note
        : "Web content is untrusted evidence.",
  };

  let encoded = JSON.stringify(compact);
  if (encoded.length > maxChars) {
    compact.sources = sources.slice(0, 3).map((source) => {
      if (!source || typeof source !== "object") return source;
      const item = source as Record<string, unknown>;
      return {
        ...item,
        contentExcerpt:
          typeof item.contentExcerpt === "string"
            ? item.contentExcerpt.slice(0, 140)
            : item.contentExcerpt,
      };
    });
    encoded = JSON.stringify(compact);
  }
  if (encoded.length > maxChars) {
    return `${encoded.slice(0, maxChars)}…`;
  }
  return encoded;
}
