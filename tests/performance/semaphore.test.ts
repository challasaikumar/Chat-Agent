import { describe, expect, it } from "vitest";
import { Semaphore } from "../../apps/api/src/performance/semaphore.ts";
import { TtlLruCache } from "../../apps/api/src/performance/lru-cache.ts";
import { StageTimer } from "../../apps/api/src/performance/stage-timer.ts";
import {
  stopAcceptingTraffic,
  startAcceptingTraffic,
  isAcceptingTraffic,
} from "../../apps/api/src/performance/readiness.ts";
import { createTestDatabase } from "../../apps/api/src/db/test-utils.ts";
import { itDb } from "../helpers/db.ts";
import { integrityCheckPostgres } from "../../apps/api/src/performance/backup.ts";

describe("performance primitives", () => {
  it("bounds semaphore concurrency", async () => {
    const sem = new Semaphore(2, "test");
    let active = 0;
    let maxActive = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () =>
        sem.run(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise((r) => setTimeout(r, 10));
          active -= 1;
        }),
      ),
    );
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("evicts lru and expires ttl", () => {
    const cache = new TtlLruCache<string>(2);
    cache.set("a", "1", 10_000, 1000);
    cache.set("b", "2", 10_000, 1001);
    cache.set("c", "3", 10_000, 1002);
    expect(cache.get("a", 1003)).toBeUndefined();
    expect(cache.get("b", 1003)).toBe("2");
    cache.set("d", "4", 1, 2000);
    expect(cache.get("d", 2002)).toBeUndefined();
  });

  it("records stage timings and readiness", () => {
    const timer = new StageTimer();
    timer.start("x");
    timer.end("x");
    timer.markFirstToken();
    expect(timer.snapshot().stages.x).toBeGreaterThanOrEqual(0);
    expect(timer.timeToFirstTokenMs()).toBeGreaterThanOrEqual(0);

    startAcceptingTraffic();
    expect(isAcceptingTraffic()).toBe(true);
    stopAcceptingTraffic();
    expect(isAcceptingTraffic()).toBe(false);
    startAcceptingTraffic();
  });

  itDb("runs postgres integrity check on temp schema", async () => {
    const db = await createTestDatabase();
    const check = await integrityCheckPostgres(db.db);
    expect(check.ok).toBe(true);
    await db.cleanup();
  });
});
