export type StageTimings = Record<string, number>;

/**
 * Lightweight stage stopwatch for agent execution traces.
 */
export class StageTimer {
  private readonly marks = new Map<string, number>();
  private readonly durations: StageTimings = {};
  readonly startedAt = Date.now();
  firstTokenAt: number | null = null;

  start(stage: string): void {
    this.marks.set(stage, Date.now());
  }

  end(stage: string): number {
    const begin = this.marks.get(stage) ?? this.startedAt;
    const duration = Date.now() - begin;
    this.durations[stage] = (this.durations[stage] ?? 0) + duration;
    this.marks.delete(stage);
    return duration;
  }

  markFirstToken(): void {
    if (this.firstTokenAt == null) {
      this.firstTokenAt = Date.now();
    }
  }

  timeToFirstTokenMs(): number | null {
    if (this.firstTokenAt == null) return null;
    return this.firstTokenAt - this.startedAt;
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  snapshot(): {
    stages: StageTimings;
    totalMs: number;
    timeToFirstTokenMs: number | null;
  } {
    return {
      stages: { ...this.durations },
      totalMs: this.totalMs(),
      timeToFirstTokenMs: this.timeToFirstTokenMs(),
    };
  }
}
