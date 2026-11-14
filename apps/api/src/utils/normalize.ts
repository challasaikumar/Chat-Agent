/** Normalize entity names for deduplication. */
export function normalizeCanonicalName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeFactKey(fact: string): string {
  return fact
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
