import { describe, expect, it } from "vitest";
import { searchInputSchema } from "../apps/api/src/search/search.schemas.ts";

describe("search input validation", () => {
  it("rejects empty and whitespace queries", () => {
    expect(searchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(searchInputSchema.safeParse({ query: "   " }).success).toBe(false);
  });

  it("rejects oversized queries", () => {
    expect(
      searchInputSchema.safeParse({ query: "x".repeat(401) }).success,
    ).toBe(false);
  });

  it("rejects invalid dates and inverted ranges", () => {
    expect(
      searchInputSchema.safeParse({
        query: "postgres",
        startDate: "2025-13-01",
      }).success,
    ).toBe(false);

    expect(
      searchInputSchema.safeParse({
        query: "postgres",
        startDate: "2025-11-10",
        endDate: "2025-11-01",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid maxResults and searchDepth", () => {
    expect(
      searchInputSchema.safeParse({ query: "x", maxResults: 0 }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({ query: "x", maxResults: 21 }).success,
    ).toBe(false);
    expect(
      searchInputSchema.safeParse({ query: "x", searchDepth: "deep" }).success,
    ).toBe(false);
  });

  it("rejects invalid domains and include/exclude conflicts", () => {
    expect(
      searchInputSchema.safeParse({
        query: "x",
        includeDomains: ["not a domain"],
      }).success,
    ).toBe(false);

    expect(
      searchInputSchema.safeParse({
        query: "x",
        includeDomains: ["example.com"],
        excludeDomains: ["example.com"],
      }).success,
    ).toBe(false);
  });

  it("accepts a valid payload and trims the query", () => {
    const parsed = searchInputSchema.parse({
      query: "  PostgreSQL hosting pricing  ",
      searchDepth: "advanced",
      maxResults: 8,
      topic: "general",
      includeDomains: ["Example.COM"],
    });

    expect(parsed.query).toBe("PostgreSQL hosting pricing");
    expect(parsed.includeDomains).toEqual(["example.com"]);
  });

  it("rejects unknown fields via strict mode", () => {
    expect(
      searchInputSchema.safeParse({
        query: "ok",
        unknownField: true,
      }).success,
    ).toBe(false);
  });
});
