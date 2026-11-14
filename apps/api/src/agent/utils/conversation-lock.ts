/**
 * In-memory per-conversation mutex.
 * Protects a single Node process only — not distributed locking.
 */
export class ConversationLock {
  private readonly locks = new Map<string, Promise<void>>();

  async runExclusive<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(conversationId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chain = previous.then(() => gate);
    this.locks.set(conversationId, chain);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(conversationId) === chain) {
        this.locks.delete(conversationId);
      }
    }
  }

  isLocked(conversationId: string): boolean {
    return this.locks.has(conversationId);
  }
}

export const conversationLock = new ConversationLock();
