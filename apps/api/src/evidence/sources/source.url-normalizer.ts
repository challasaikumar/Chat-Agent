import { normalizeUrl } from "../../search/search.utils.js";

/**
 * Canonical URL normalization for duplicate / independence detection.
 * Reuses Phase 03 normalizeUrl and adds tracking-query stripping.
 */
const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

export function canonicalizeSourceUrl(url: string): string {
  const base = normalizeUrl(url) ?? url.trim();
  try {
    const parsed = new URL(base);
    const kept: string[] = [];
    parsed.searchParams.forEach((value, key) => {
      if (!TRACKING_PARAMS.has(key.toLowerCase())) {
        kept.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    });
    kept.sort();
    parsed.search = kept.length > 0 ? `?${kept.join("&")}` : "";
    return parsed.toString();
  } catch {
    return base;
  }
}

export function urlsAreCanonicallyEquivalent(a: string, b: string): boolean {
  return canonicalizeSourceUrl(a) === canonicalizeSourceUrl(b);
}

export function sameRegistrableDomain(a: string, b: string): boolean {
  try {
    const da = new URL(a).hostname.replace(/^www\./, "").toLowerCase();
    const db = new URL(b).hostname.replace(/^www\./, "").toLowerCase();
    return da === db || da.endsWith(`.${db}`) || db.endsWith(`.${da}`);
  } catch {
    return false;
  }
}
