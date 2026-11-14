import { dayBounds } from "./temporal-date.utils.js";
import type { TemporalIntent } from "../temporal.types.js";

export type TemporalWindow = {
  start: Date | null;
  end: Date | null;
  comparisonInstant: Date;
};

export class TemporalWindowService {
  toWindow(intent: TemporalIntent, now = new Date()): TemporalWindow {
    let start: Date | null = null;
    let end: Date | null = null;

    if (intent.startDate) {
      start = dayBounds(intent.startDate, intent.timeZone).start;
    }
    if (intent.endDate) {
      end = dayBounds(intent.endDate, intent.timeZone).end;
    }

    return {
      start,
      end,
      comparisonInstant: now,
    };
  }

  isWithinWindow(observedAt: Date, window: TemporalWindow): boolean {
    if (window.start && observedAt < window.start) {
      return false;
    }
    if (window.end && observedAt > window.end) {
      return false;
    }
    return true;
  }
}
