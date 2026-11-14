import {
  assertValidTimeZone,
  calendarDayBoundsUtc,
  getZonedParts,
  zonedLocalToUtc,
} from "../../utils/timezone.js";

export type DateIntent =
  | {
      kind: "absolute_day";
      date: string;
      start: Date;
      end: Date;
      label: string;
    }
  | {
      kind: "relative_range";
      from: string;
      to: string;
      start: Date;
      end: Date;
      label: string;
    };

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function localToday(now: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const parts = getZonedParts(now, timeZone);
  const asUtc = zonedLocalToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour: 12 },
    timeZone,
  );
  // weekday in the target zone via en-US long weekday
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  })
    .format(now)
    .toLowerCase();
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: WEEKDAYS[weekdayName] ?? asUtc.getUTCDay(),
  };
}

function resolveYearless(
  month: number,
  day: number,
  today: { year: number; month: number; day: number },
  preferPast: boolean,
): { year: number; month: number; day: number } {
  let year = today.year;
  const candidate = { year, month, day };
  const afterToday =
    month > today.month || (month === today.month && day > today.day);
  if (preferPast && afterToday) {
    year -= 1;
  }
  return { year, month, day: candidate.day };
}

function previousWeekday(
  todayWeekday: number,
  targetWeekday: number,
  today: { year: number; month: number; day: number },
  timeZone: string,
): { year: number; month: number; day: number } {
  let delta = (todayWeekday - targetWeekday + 7) % 7;
  if (delta === 0) {
    delta = 7; // "last Tuesday" means previous occurrence
  }
  const noon = zonedLocalToUtc(
    { year: today.year, month: today.month, day: today.day, hour: 12 },
    timeZone,
  );
  const past = new Date(noon.getTime() - delta * 24 * 60 * 60 * 1000);
  const parts = getZonedParts(past, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

/**
 * Deterministic date intent parser for historical questions.
 * Uses the actual current date and an explicit IANA timezone.
 */
export class DateIntentParser {
  parse(
    text: string,
    options: { timeZone: string; now?: Date; preferPast?: boolean } ,
  ): DateIntent | null {
    assertValidTimeZone(options.timeZone);
    const now = options.now ?? new Date();
    const preferPast = options.preferPast !== false;
    const today = localToday(now, options.timeZone);
    const lower = text.toLowerCase();

    if (/\byesterday\b/.test(lower)) {
      const noon = zonedLocalToUtc(
        { year: today.year, month: today.month, day: today.day, hour: 12 },
        options.timeZone,
      );
      const past = new Date(noon.getTime() - 24 * 60 * 60 * 1000);
      const parts = getZonedParts(past, options.timeZone);
      const date = formatDate(parts.year, parts.month, parts.day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return {
        kind: "absolute_day",
        date,
        ...bounds,
        label: "yesterday",
      };
    }

    if (/\blast week\b/.test(lower)) {
      const endParts = previousWeekday(today.weekday, 0, today, options.timeZone); // last Sunday end-ish
      // last week = previous Mon-Sun
      const sunday = previousWeekday(today.weekday, 0, today, options.timeZone);
      const sundayNoon = zonedLocalToUtc(
        { year: sunday.year, month: sunday.month, day: sunday.day, hour: 12 },
        options.timeZone,
      );
      const monday = getZonedParts(
        new Date(sundayNoon.getTime() - 6 * 24 * 60 * 60 * 1000),
        options.timeZone,
      );
      const from = formatDate(monday.year, monday.month, monday.day);
      const to = formatDate(sunday.year, sunday.month, sunday.day);
      const start = calendarDayBoundsUtc(from, options.timeZone).start;
      const end = calendarDayBoundsUtc(to, options.timeZone).end;
      void endParts;
      return {
        kind: "relative_range",
        from,
        to,
        start,
        end,
        label: "last week",
      };
    }

    if (/\bearlier this month\b/.test(lower)) {
      const from = formatDate(today.year, today.month, 1);
      const to = formatDate(today.year, today.month, Math.max(1, today.day - 1));
      if (today.day <= 1) {
        return null;
      }
      return {
        kind: "relative_range",
        from,
        to,
        start: calendarDayBoundsUtc(from, options.timeZone).start,
        end: calendarDayBoundsUtc(to, options.timeZone).end,
        label: "earlier this month",
      };
    }

    const lastWeekday = /\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(
      lower,
    );
    if (lastWeekday?.[1]) {
      const target = WEEKDAYS[lastWeekday[1]]!;
      const resolved = previousWeekday(today.weekday, target, today, options.timeZone);
      const date = formatDate(resolved.year, resolved.month, resolved.day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return {
        kind: "absolute_day",
        date,
        ...bounds,
        label: `last ${lastWeekday[1]}`,
      };
    }

    // November 3, 2026 / Nov 3 2026
    const monthDayYear =
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(
        text,
      );
    if (monthDayYear) {
      const month = MONTHS[monthDayYear[1]!.toLowerCase()]!;
      const day = Number(monthDayYear[2]);
      const year = Number(monthDayYear[3]);
      const date = formatDate(year, month, day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return { kind: "absolute_day", date, ...bounds, label: date };
    }

    // 3 November 2026
    const dayMonthYear =
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec),?\s+(\d{4})\b/i.exec(
        text,
      );
    if (dayMonthYear) {
      const day = Number(dayMonthYear[1]);
      const month = MONTHS[dayMonthYear[2]!.toLowerCase()]!;
      const year = Number(dayMonthYear[3]);
      const date = formatDate(year, month, day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return { kind: "absolute_day", date, ...bounds, label: date };
    }

    // November 3 / Nov 3
    const monthDay =
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(
        text,
      );
    if (monthDay) {
      const month = MONTHS[monthDay[1]!.toLowerCase()]!;
      const day = Number(monthDay[2]);
      const resolved = resolveYearless(month, day, today, preferPast);
      const date = formatDate(resolved.year, resolved.month, resolved.day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return { kind: "absolute_day", date, ...bounds, label: date };
    }

    // 3 November
    const dayMonth =
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.exec(
        text,
      );
    if (dayMonth) {
      const day = Number(dayMonth[1]);
      const month = MONTHS[dayMonth[2]!.toLowerCase()]!;
      const resolved = resolveYearless(month, day, today, preferPast);
      const date = formatDate(resolved.year, resolved.month, resolved.day);
      const bounds = calendarDayBoundsUtc(date, options.timeZone);
      return { kind: "absolute_day", date, ...bounds, label: date };
    }

    return null;
  }
}
