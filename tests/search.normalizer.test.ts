import { describe, expect, it } from "vitest";
import { normalizeSearchResponse } from "../apps/api/src/search/search.normalizer.ts";
import {
  contentHash,
  isHttpUrl,
  normalizeUrl,
  parsePublicationDate,
} from "../apps/api/src/search/search.utils.ts";

describe("search normalization", () => {
  it("validates http(s) URLs and rejects bad schemes", () => {
    expect(isHttpUrl("https://example.com/path?q=1")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(normalizeUrl("HTTPS://Example.com/a?b=1#frag")).toBe(
      "https://example.com/a?b=1",
    );
  });

  it("normalizes domains, dedupes URLs, preserves scores and hashes", () => {
    const retrievedAt = new Date("2025-11-13T10:00:00.000Z");
    const normalized = normalizeSearchResponse(
      {
        query: "pricing",
        provider: "tavily",
        requestId: "req-1",
        responseTimeMs: 120,
        results: [
          {
            title: "A",
            url: "https://Example.com/page?x=1",
            content: "first",
            score: 0.9,
            publishedDate: "2025-01-02",
            favicon: "https://example.com/favicon.ico",
          },
          {
            title: "Duplicate",
            url: "https://example.com/page?x=1#section",
            content: "ignored",
            score: 0.1,
          },
          {
            title: "Bad",
            url: "javascript:void(0)",
            content: "nope",
          },
          {
            title: "B",
            url: "https://other.com/b",
            content: "second",
            score: 0.5,
            publishedDate: "not-a-date",
          },
        ],
        usage: { credits: 1 },
      },
      { maxContentLength: 12_000, retrievedAt },
    );

    expect(normalized.results).toHaveLength(2);
    expect(normalized.results[0]?.domain).toBe("example.com");
    expect(normalized.results[0]?.score).toBe(0.9);
    expect(normalized.results[0]?.publishedAt).toBe(
      new Date("2025-01-02").toISOString(),
    );
    expect(normalized.results[1]?.publishedAt).toBeNull();
    expect(normalized.results[0]?.contentHash).toBe(
      contentHash({
        url: "https://example.com/page?x=1",
        title: "A",
        content: "first",
      }),
    );
    expect(normalized.usage?.credits).toBe(1);
  });

  it("limits content length and keeps missing publication dates null", () => {
    const normalized = normalizeSearchResponse(
      {
        query: "q",
        provider: "tavily",
        results: [
          {
            title: "Long",
            url: "https://example.com/long",
            content: "x".repeat(100),
          },
        ],
      },
      { maxContentLength: 20 },
    );

    expect(normalized.results[0]?.content.length).toBeLessThanOrEqual(20);
    expect(parsePublicationDate("")).toBeNull();
    expect(parsePublicationDate(undefined)).toBeNull();
  });
});
