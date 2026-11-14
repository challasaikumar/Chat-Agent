const DANGEROUS_SCHEMES = /^(javascript|data|vbscript|file):/i;

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function assertSafeExternalUrl(value: string): void {
  if (!isSafeHttpUrl(value) || DANGEROUS_SCHEMES.test(value.trim())) {
    throw new Error("Unsafe URL scheme");
  }
}

/** Strip characters that break FTS5 MATCH when used as raw query fragments. */
export function sanitizeFtsQuery(raw: string): string {
  return raw
    .replace(/["']/g, " ")
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, " ")
    .trim()
    .slice(0, 200);
}
