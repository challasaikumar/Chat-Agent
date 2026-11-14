import { describe, expect, it } from "vitest";
import { TemporalIntentParser } from "../apps/api/src/temporal/intent/temporal-intent.parser.ts";

describe("TemporalIntentParser", () => {
  const parser = new TemporalIntentParser();
  const now = new Date("2026-11-13T10:00:00.000Z"); // Fri in IST
  const tz = "Asia/Kolkata";

  it("resolves November 3 and 3 November", () => {
    const a = parser.parse("What changed since November 3?", { timeZone: tz, now });
    expect(a.startDate).toBe("2026-11-03");
    expect(a.isComparison).toBe(true);
    expect(a.referenceType).toBe("explicit_date");

    const b = parser.parse("Has pricing changed since 3 November?", { timeZone: tz, now });
    expect(b.startDate).toBe("2026-11-03");
  });

  it("resolves ISO dates", () => {
    const intent = parser.parse("Compare since 2026-11-03", { timeZone: tz, now });
    expect(intent.startDate).toBe("2026-11-03");
  });

  it("resolves last Tuesday", () => {
    // 2026-11-13 is Friday IST → last Tuesday = 2026-11-10
    const intent = parser.parse("Has pricing changed since last Tuesday?", {
      timeZone: tz,
      now,
    });
    expect(intent.startDate).toBe("2026-11-10");
    expect(intent.referenceType).toBe("relative_date");
  });

  it("resolves last Monday", () => {
    const intent = parser.parse("On Monday we shortlisted tools. Has pricing changed?", {
      timeZone: tz,
      now,
    });
    expect(intent.startDate).toBe("2026-11-09");
  });

  it("resolves yesterday and two days ago", () => {
    const y = parser.parse("Anything new since yesterday?", { timeZone: tz, now });
    expect(y.startDate).toBe("2026-11-12");

    const t = parser.parse("What changed two days ago?", { timeZone: tz, now });
    expect(t.startDate).toBe("2026-11-11");
  });

  it("resolves last week and last month", () => {
    const week = parser.parse("What changed last week?", { timeZone: tz, now });
    expect(week.referenceType).toBe("date_range");
    expect(week.startDate).toBeTruthy();
    expect(week.endDate).toBeTruthy();

    const month = parser.parse("Any updates last month?", { timeZone: tz, now });
    expect(month.startDate).toBe("2026-10-01");
    expect(month.endDate).toBe("2026-10-31");
  });

  it("marks previous research references", () => {
    const intent = parser.parse("Has anything changed since my previous research?", {
      timeZone: tz,
      now,
    });
    expect(intent.isComparison).toBe(true);
    expect(intent.referenceType).toBe("previous_research");
  });

  it("detects pricing and feature categories", () => {
    const intent = parser.parse(
      "Has HubSpot changed pricing or shipped a new feature since Monday?",
      { timeZone: tz, now },
    );
    expect(intent.changeCategories).toContain("pricing");
    expect(intent.changeCategories).toContain("features");
    expect(intent.comparisonTargets).toContain("HubSpot");
  });

  it("flags ambiguous comparison without date", () => {
    const intent = parser.parse("Has the price changed?", { timeZone: tz, now });
    expect(intent.isComparison).toBe(true);
    expect(intent.ambiguous).toBe(true);
  });
});
