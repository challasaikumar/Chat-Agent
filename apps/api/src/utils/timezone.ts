/**
 * Calendar-day helpers for an explicit IANA timezone.
 * Timestamps are stored in UTC; never assume the process local TZ.
 */

export function assertValidTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}`);
  }
}

/** Parts of an instant in a given IANA zone. */
export function getZonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (value === undefined) {
      throw new Error(`Unable to resolve ${type} for ${timeZone}`);
    }
    return Number(value);
  };

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * Convert a wall-clock local datetime in `timeZone` to a UTC Date.
 * Uses iterative offset correction to handle DST transitions.
 */
export function zonedLocalToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  timeZone: string,
): Date {
  assertValidTimeZone(timeZone);

  const hour = parts.hour ?? 0;
  const minute = parts.minute ?? 0;
  const second = parts.second ?? 0;
  const millisecond = parts.millisecond ?? 0;

  // First guess: treat components as UTC.
  let utcMillis = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    hour,
    minute,
    second,
    millisecond,
  );

  for (let i = 0; i < 3; i += 1) {
    const asUtc = new Date(utcMillis);
    const zoned = getZonedParts(asUtc, timeZone);
    const asIfUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
      asUtc.getUTCMilliseconds(),
    );
    const desired = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      hour,
      minute,
      second,
      millisecond,
    );
    utcMillis += desired - asIfUtc;
  }

  return new Date(utcMillis);
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_RE.exec(date);
  if (!match) {
    throw new Error(`Invalid calendar date (expected YYYY-MM-DD): ${date}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${date}`);
  }

  return { year, month, day };
}

/** Inclusive UTC bounds for a local calendar day in `timeZone`. */
export function calendarDayBoundsUtc(
  date: string,
  timeZone: string,
): { start: Date; end: Date } {
  const { year, month, day } = parseCalendarDate(date);
  const start = zonedLocalToUtc({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone);

  // End of day = start of next local day minus 1ms.
  const nextLocal = new Date(Date.UTC(year, month - 1, day + 1));
  const nextStart = zonedLocalToUtc(
    {
      year: nextLocal.getUTCFullYear(),
      month: nextLocal.getUTCMonth() + 1,
      day: nextLocal.getUTCDate(),
      hour: 0,
      minute: 0,
      second: 0,
    },
    timeZone,
  );

  return { start, end: new Date(nextStart.getTime() - 1) };
}

export function dateRangeBoundsUtc(options: {
  from?: string;
  to?: string;
  date?: string;
  timeZone: string;
}): { start?: Date; end?: Date } {
  assertValidTimeZone(options.timeZone);

  if (options.date) {
    return calendarDayBoundsUtc(options.date, options.timeZone);
  }

  let start: Date | undefined;
  let end: Date | undefined;

  if (options.from) {
    start = calendarDayBoundsUtc(options.from, options.timeZone).start;
  }
  if (options.to) {
    end = calendarDayBoundsUtc(options.to, options.timeZone).end;
  }

  return { start, end };
}
