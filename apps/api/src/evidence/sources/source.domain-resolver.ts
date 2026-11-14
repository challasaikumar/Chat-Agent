import { KNOWN_DOMAIN_METADATA } from "../evidence.config.js";

export type DomainResolution = {
  domain: string;
  publisher: string | null;
  knownRelationship:
    | "first_party"
    | "government"
    | "news"
    | "community"
    | null;
  notes: string | null;
};

export function resolveDomain(url: string): DomainResolution {
  let domain = "unknown";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return {
      domain: "unknown",
      publisher: null,
      knownRelationship: null,
      notes: "unparseable_url",
    };
  }

  const exact = KNOWN_DOMAIN_METADATA[domain];
  if (exact) {
    return {
      domain,
      publisher: exact.publisher ?? null,
      knownRelationship: exact.relationship ?? null,
      notes: exact.notes ?? null,
    };
  }

  // Conservative suffix / TLD hints — never universal trust.
  if (domain.endsWith(".gov") || domain.endsWith(".gov.uk")) {
    return {
      domain,
      publisher: null,
      knownRelationship: "government",
      notes: "government_tld",
    };
  }

  for (const [key, meta] of Object.entries(KNOWN_DOMAIN_METADATA)) {
    if (key.includes(".") && (domain === key || domain.endsWith(`.${key}`))) {
      return {
        domain,
        publisher: meta.publisher ?? null,
        knownRelationship: meta.relationship ?? null,
        notes: meta.notes ?? "suffix_match",
      };
    }
  }

  return {
    domain,
    publisher: null,
    knownRelationship: null,
    notes: null,
  };
}
