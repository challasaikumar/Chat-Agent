/**
 * Injectable clock for temporal evaluations.
 * Production code may continue to use `new Date()`; evaluation fixtures
 * must use FixedClock so results do not depend on wall-clock day.
 */

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {
    if (Number.isNaN(fixed.getTime())) {
      throw new Error("FixedClock requires a valid Date");
    }
  }

  now(): Date {
    return new Date(this.fixed.getTime());
  }

  iso(): string {
    return this.now().toISOString();
  }
}

export function createFixedClock(iso: string): FixedClock {
  return new FixedClock(new Date(iso));
}
