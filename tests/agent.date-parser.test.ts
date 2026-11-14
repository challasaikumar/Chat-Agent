import { describe, expect, it } from "vitest";
import { DateIntentParser } from "../apps/api/src/agent/context/context.date-parser.ts";

describe("DateIntentParser", () => {
  const parser = new DateIntentParser();
  // Fixed "now": Friday 13 Nov 2026, afternoon IST
  const now = new Date("2026-11-13T10:00:00.000Z");
  const timeZone = "Asia/Kolkata";

  it("resolves yearless November 3 as past occurrence", () => {
    const intent = parser.parse("What did I ask on 3 November?", {
      timeZone,
      now,
      preferPast: true,
    });
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-03");
    }
  });

  it("resolves November 3, 2026 explicitly", () => {
    const intent = parser.parse("On November 3, 2026 we talked", {
      timeZone,
      now,
    });
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-03");
    }
  });

  it("resolves last Tuesday relative to Friday", () => {
    const intent = parser.parse("Last Tuesday I asked about Postgres hosting", {
      timeZone,
      now,
    });
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-10");
      expect(intent.label).toBe("last tuesday");
    }
  });

  it("resolves yesterday in Asia/Kolkata", () => {
    const intent = parser.parse("What about yesterday?", { timeZone, now });
    expect(intent?.kind).toBe("absolute_day");
    if (intent?.kind === "absolute_day") {
      expect(intent.date).toBe("2026-11-12");
    }
  });

  it("returns null when no date intent is present", () => {
    expect(
      parser.parse("Tell me a joke", { timeZone, now }),
    ).toBeNull();
  });
});
