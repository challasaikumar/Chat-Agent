import { createHash } from "node:crypto";

const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "file:", "ftp:"]);

export function sanitizeSecret(value: string): string {
  return value
    .replace(/tvly-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]");
}

export function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return `${content.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function contentHash(parts: {
  url: string;
  title: string;
  content: string;
}): string {
  return createHash("sha256")
    .update(`${parts.url}\n${parts.title}\n${parts.content}`)
    .digest("hex");
}

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Normalize URL for deduplication without stripping meaningful query params.
 * Removes hash fragments and normalizes hostname casing.
 */
export function normalizeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (BLOCKED_SCHEMES.has(parsed.protocol)) {
      return null;
    }

    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    // Drop default ports.
    if (
      (parsed.protocol === "http:" && parsed.port === "80") ||
      (parsed.protocol === "https:" && parsed.port === "443")
    ) {
      parsed.port = "";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isHttpUrl(raw: string): boolean {
  return normalizeUrl(raw) !== null;
}

export function parsePublicationDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const asDate = new Date(trimmed);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }

  return asDate.toISOString();
}

export function timeoutSecondsFromMs(timeoutMs: number): number {
  return Math.max(1, Math.ceil(timeoutMs / 1000));
}
