import { sql, type SQL } from "drizzle-orm";

/**
 * Sanitize untrusted user search input for full-text search.
 * Output is a normalized form (`"a" AND "b"` or a single quoted phrase) that is converted
 * to a Postgres tsquery via `toTsQuerySql`. Never concatenate raw input into SQL —
 * callers always bind parameters.
 */

const FTS_SPECIAL = /["^~*(){}:\[\]\\]/g;
const BOOLEAN_WORDS = new Set(["and", "or", "not", "near"]);

export function sanitizeFtsQuery(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // Phrase search when the whole query is quoted.
  const phraseMatch = /^"([^"]+)"$/.exec(trimmed);
  if (phraseMatch?.[1]) {
    const phrase = phraseMatch[1].replace(FTS_SPECIAL, " ").replace(/\s+/g, " ").trim();
    if (!phrase) {
      return null;
    }
    return `"${phrase}"`;
  }

  const tokens = trimmed
    .replace(FTS_SPECIAL, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => !BOOLEAN_WORDS.has(token.toLowerCase()))
    .map((token) => token.replace(/"/g, ""));

  if (tokens.length === 0) {
    return null;
  }

  // Quote each token so FTS treats them as literals (keyword AND semantics).
  return tokens.map((token) => `"${token}"`).join(" AND ");
}

export function buildSnippet(content: string, query: string, radius = 60): string {
  const terms = query
    .replace(/"/g, "")
    .split(/\s+AND\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const lower = content.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found >= 0) {
      index = found;
      break;
    }
  }

  if (index < 0) {
    return content.length <= radius * 2
      ? content
      : `${content.slice(0, radius * 2)}…`;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(content.length, index + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

/**
 * Convert the sanitized query (see `sanitizeFtsQuery`) into a bound Postgres tsquery.
 * - `"a" AND "b"` → plainto_tsquery (all terms must match)
 * - `"some phrase"` → phraseto_tsquery (adjacent terms)
 * Both functions accept arbitrary text safely (no operator injection).
 */
export function toTsQuerySql(sanitized: string, config = "english"): SQL {
  if (/\sAND\s/.test(sanitized)) {
    const terms = sanitized
      .replace(/"/g, "")
      .split(/\s+AND\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
      .join(" ");
    return sql`plainto_tsquery(${config}::regconfig, ${terms})`;
  }
  const phrase = sanitized.replace(/"/g, "").trim();
  return sql`phraseto_tsquery(${config}::regconfig, ${phrase})`;
}
