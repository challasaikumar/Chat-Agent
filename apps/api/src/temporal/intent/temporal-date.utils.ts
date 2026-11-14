import {
  assertValidTimeZone,
  calendarDayBoundsUtc,
  getZonedParts,
  zonedLocalToUtc,
} from "../../utils/timezone.js";

export function formatCalendarDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function localCalendarToday(
  now: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number } {
  assertValidTimeZone(timeZone);
  const parts = getZonedParts(now, timeZone);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  })
    .format(now)
    .toLowerCase();
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    weekday: map[weekdayName] ?? 0,
  };
}

export function addLocalDays(
  base: { year: number; month: number; day: number },
  deltaDays: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  const noon = zonedLocalToUtc(
    { year: base.year, month: base.month, day: base.day, hour: 12 },
    timeZone,
  );
  const shifted = new Date(noon.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  const parts = getZonedParts(shifted, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function previousWeekdayDate(
  today: { year: number; month: number; day: number; weekday: number },
  targetWeekday: number,
  timeZone: string,
): { year: number; month: number; day: number } {
  let delta = (today.weekday - targetWeekday + 7) % 7;
  if (delta === 0) {
    delta = 7;
  }
  return addLocalDays(today, -delta, timeZone);
}

export function dayBounds(date: string, timeZone: string) {
  return calendarDayBoundsUtc(date, timeZone);
}
