export type LruEntry<V> = {
  value: V;
  expiresAt: number;
  insertedAt: number;
};

/**
 * Bounded in-process TTL/LRU cache. Single Node process only — not distributed.
 */
export class TtlLruCache<V> {
  private readonly map = new Map<string, LruEntry<V>>();
  hits = 0;
  misses = 0;
  evictions = 0;

  constructor(private readonly maxEntries: number) {
    if (maxEntries < 1) {
      throw new Error("TtlLruCache maxEntries must be >= 1");
    }
  }

  get size(): number {
    return this.map.size;
  }

  get hitRate(): number | null {
    const total = this.hits + this.misses;
    if (total === 0) return null;
    return this.hits / total;
  }

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= now) {
      this.map.delete(key);
      this.misses += 1;
      this.evictions += 1;
      return undefined;
    }
    // refresh LRU order
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  peekEntry(key: string, now = Date.now()): LruEntry<V> | undefined {
    const entry = this.map.get(key);
    if (!entry || entry.expiresAt <= now) return undefined;
    return entry;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    while (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
      this.evictions += 1;
    }
    this.map.set(key, {
      value,
      insertedAt: now,
      expiresAt: now + Math.max(1, ttlMs),
    });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  stats() {
    return {
      size: this.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hitRate,
    };
  }
}
