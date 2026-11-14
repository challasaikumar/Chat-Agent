/**
 * Counting semaphore for single-process concurrency limits.
 * Releases on both success and failure; supports AbortSignal.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
  }> = [];

  constructor(
    private readonly max: number,
    private readonly name = "semaphore",
  ) {
    if (max < 1) throw new Error("Semaphore max must be >= 1");
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.waiters.length;
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw new Error(`${this.name} acquire aborted`);
    }

    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }

    await new Promise<void>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal,
        onAbort: undefined as (() => void) | undefined,
      };
      waiter.onAbort = () => {
        const idx = this.waiters.indexOf(waiter);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error(`${this.name} acquire aborted`));
      };
      if (signal) {
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });

    this.active += 1;
    return () => this.release();
  }

  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (!next) return;
    if (next.signal && next.onAbort) {
      next.signal.removeEventListener("abort", next.onAbort);
    }
    next.resolve();
  }
}
