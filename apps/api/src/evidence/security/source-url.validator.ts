/**
 * Never accept model-generated URLs as trusted citations.
 * Only URLs that already exist in persisted research sources are valid.
 */

const MODEL_URL_PATTERN =
  /https?:\/\/[^\s\]\)"'<>]+/gi;

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(MODEL_URL_PATTERN) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?)]+$/, "")))];
}

export function validateUrlAgainstPersistedSources(
  candidateUrl: string,
  persistedUrls: Iterable<string>,
): { valid: boolean; reason: string } {
  const normalizedCandidate = normalizeLooseUrl(candidateUrl);
  if (!normalizedCandidate) {
    return { valid: false, reason: "invalid_url" };
  }
  for (const persisted of persistedUrls) {
    if (normalizeLooseUrl(persisted) === normalizedCandidate) {
      return { valid: true, reason: "matched_persisted_source" };
    }
  }
  return { valid: false, reason: "fabricated_or_unpersisted_url" };
}

export function findFabricatedUrls(
  answerText: string,
  persistedUrls: Iterable<string>,
): string[] {
  const fabricated: string[] = [];
  for (const url of extractUrlsFromText(answerText)) {
    const result = validateUrlAgainstPersistedSources(url, persistedUrls);
    if (!result.valid) {
      fabricated.push(url);
    }
  }
  return fabricated;
}

function normalizeLooseUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
