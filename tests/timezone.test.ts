import { describe, expect, it } from "vitest";
import {
  calendarDayBoundsUtc,
  parseCalendarDate,
  zonedLocalToUtc,
} from "../apps/api/src/utils/timezone.ts";

describe("timezone helpers", () => {
  it("parses calendar dates and rejects invalid values", () => {
    expect(parseCalendarDate("2025-11-03")).toEqual({
      year: 2025,
      month: 11,
      day: 3,
    });
    expect(() => parseCalendarDate("2025-13-01")).toThrow();
  });

  it("computes Asia/Kolkata day bounds in UTC", () => {
    const { start, end } = calendarDayBoundsUtc("2025-11-03", "Asia/Kolkata");
    // IST is UTC+5:30 year-round.
    expect(start.toISOString()).toBe("2025-11-02T18:30:00.000Z");
    expect(end.toISOString()).toBe("2025-11-03T18:29:59.999Z");
  });

  it("handles DST transition days for America/New_York", () => {
    const spring = calendarDayBoundsUtc("2025-03-09", "America/New_York");
    // 23-hour civil day after spring forward.
    const durationHours =
      (spring.end.getTime() - spring.start.getTime() + 1) / (60 * 60 * 1000);
    expect(durationHours).toBe(23);

    const local = zonedLocalToUtc(
      { year: 2025, month: 3, day: 9, hour: 12, minute: 0, second: 0 },
      "America/New_York",
    );
    expect(local.toISOString()).toBe("2025-03-09T16:00:00.000Z");
  });
});
