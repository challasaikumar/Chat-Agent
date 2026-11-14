#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { loadEnvironment } from "../config/env.js";
import { loadPerfConfig, perfConfigSnapshot } from "./perf.config.js";
import { createTestDatabase } from "../db/test-utils.js";
import { buildApp } from "../app.js";
import type { SearchProvider } from "../search/search.interface.js";
import { createFixtureOpenAiProvider } from "../evaluation/fixtures/fixture.openai-provider.js";
import { resetSharedSearchCache } from "./search-cache.js";
import { resetMetricsRegistry, getMetricsRegistry } from "./metrics.registry.js";
import { resetResourceGate } from "./resource-gate.js";
import { integrityCheckPostgres } from "./backup.js";
import { summarizeLatencies } from "../evaluation/metrics/latency.metrics.js";

type Args = {
  command: string;
  label?: string;
  concurrency?: number;
  iterations?: number;
  help?: boolean;
};

function parseArgs(argv: string[]): Args {
  const [command = "perf:smoke", ...rest] = argv;
  const args: Args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i]!;
    const n = rest[i + 1];
    if (t === "--label") {
      args.label = n;
      i += 1;
    } else if (t === "--concurrency") {
      args.concurrency = Number(n);
      i += 1;
    } else if (t === "--iterations") {
      args.iterations = Number(n);
      i += 1;
    } else if (t === "--help" || t === "-h") {
      args.help = true;
    }
  }
  return args;
}

function gitSha(root: string): string | null {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function mockSearch(delayMs = 5): SearchProvider {
  return {
    name: "tavily",
    async search(input) {
      await new Promise((r) => setTimeout(r, delayMs));
      const retrievedAt = new Date().toISOString();
      return {
        query: input.query,
        provider: "tavily",
        requestId: "tvly-perf",
        responseTimeMs: delayMs,
        resultCount: 1,
        usage: { credits: 1 },
        results: [
          {
            title: "Perf Fixture",
            url: "https://example.com/pricing",
            domain: "example.com",
            content: "Example Pro plan costs $10.00 per month.",
            score: 0.9,
            publishedAt: "2026-11-01T00:00:00.000Z",
            retrievedAt,
            faviconUrl: null,
            contentHash: "perf-hash",
          },
        ],
      };
    },
  };
}

async function runSmokeSuite(label: string) {
  resetSharedSearchCache();
  resetMetricsRegistry();
  resetResourceGate();

  const env = loadEnvironment({
    NODE_ENV: "test",
    OPENAI_API_KEY: "sk-perf",
    TAVILY_API_KEY: "tvly-perf",
    AGENT_MEMORY_PROCESS_ENABLED: "false",
    PERF_ENABLED: "true",
    PERF_SEARCH_CACHE_ENABLED: "true",
  });
  const perf = loadPerfConfig(env);
  const metrics = getMetricsRegistry(perf);
  const testDb = await createTestDatabase("perf-user");

  const responses = createFixtureOpenAiProvider([
    {
      functionCalls: [
        {
          name: "web_search",
          arguments: {
            query: "Example Pro pricing",
            searchDepth: "basic",
            maxResults: 5,
          },
        },
      ],
    },
    {
      finalAnswer: {
        answer: "Example Pro is $10.00/mo based on fixture evidence.",
        citations: [],
      },
    },
    {
      finalAnswer: {
        answer: "Cached path answer for repeat pricing question.",
        citations: [],
      },
    },
  ]);

  const app = await buildApp({
    env,
    searchProvider: mockSearch(8),
    responsesClient: responses,
    database: {
      db: testDb.db,
      databasePath: testDb.path,
      localUserId: testDb.localUserId,
    },
  });

  const created = await app.inject({
    method: "POST",
    url: "/api/conversations",
    payload: { title: "Perf smoke" },
  });
  const conversationId = created.json().data.id as string;

  const latencies: number[] = [];
  const searchCalls: number[] = [];

  // Cold search turn
  const t0 = performance.now();
  const turn1 = await app.inject({
    method: "POST",
    url: "/api/agent/turn",
    payload: {
      conversationId,
      message: "What is the latest Example Pro pricing?",
      timeZone: "Asia/Kolkata",
    },
  });
  latencies.push(performance.now() - t0);
  searchCalls.push(turn1.json().data?.execution?.searchCallCount ?? -1);

  // Warm / potential cache path (may still search if forceRefresh for pricing)
  const t1 = performance.now();
  const turn2 = await app.inject({
    method: "POST",
    url: "/api/agent/turn",
    payload: {
      conversationId,
      message: "Summarize the Example Pro plan without searching again if possible.",
      timeZone: "Asia/Kolkata",
    },
  });
  latencies.push(performance.now() - t1);
  searchCalls.push(turn2.json().data?.execution?.searchCallCount ?? -1);

  // Direct search cache probe — measure provider bypass savings
  const { SearchService } = await import("../search/search.service.js");
  const search = new SearchService(env, mockSearch(25));
  const coldStarted = performance.now();
  const cold = await search.search({ query: "stable documentation overview" });
  const coldMs = performance.now() - coldStarted;
  const warmStarted = performance.now();
  const warm = await search.search({ query: "stable documentation overview" });
  const warmMs = performance.now() - warmStarted;

  const integrity = await integrityCheckPostgres(testDb.db);
  const snapshot = metrics.snapshot();
  const latencyStats = summarizeLatencies(latencies);

  await app.close();
  await testDb.cleanup();

  return {
    label,
    mode: "mocked",
    gitCommit: gitSha(env.ROOT_DIR),
    config: perfConfigSnapshot(perf),
    integrity,
    agentTurns: {
      statusCodes: [turn1.statusCode, turn2.statusCode],
      searchCalls,
      latenciesMs: latencies,
      latency: latencyStats,
      secondTurnAvoidedSearch: searchCalls[1] === 0,
    },
    searchCache: {
      coldHit: cold.cache?.hit ?? false,
      warmHit: warm.cache?.hit ?? false,
      coldMs,
      warmMs,
      speedupRatio:
        warmMs > 0 ? Number((coldMs / warmMs).toFixed(2)) : null,
      coldRetrievedAt: cold.results[0]?.retrievedAt ?? null,
      warmRetrievedAt: warm.results[0]?.retrievedAt ?? null,
      timestampsPreserved:
        Boolean(cold.results[0]?.retrievedAt) &&
        cold.results[0]?.retrievedAt === warm.results[0]?.retrievedAt,
      cacheAgeMsOnWarm: warm.cache?.ageMs ?? null,
    },
    metrics: snapshot,
    sampleSize: latencies.length,
    lowConfidence: latencyStats.lowConfidence,
  };
}

async function runLoadSuite(label: string, concurrency: number, iterations: number) {
  resetSharedSearchCache();
  resetMetricsRegistry();
  resetResourceGate();

  const env = loadEnvironment({
    NODE_ENV: "test",
    OPENAI_API_KEY: "sk-perf",
    TAVILY_API_KEY: "tvly-perf",
    AGENT_MEMORY_PROCESS_ENABLED: "false",
    PERF_ENABLED: "true",
  });
  const perf = loadPerfConfig(env);
  const testDb = await createTestDatabase("perf-load");

  const responses = createFixtureOpenAiProvider(
    Array.from({ length: Math.max(4, concurrency * iterations) }, () => ({
      finalAnswer: {
        answer: "Load answer",
        citations: [],
      },
    })),
  );

  const app = await buildApp({
    env,
    searchProvider: mockSearch(2),
    responsesClient: responses,
    database: {
      db: testDb.db,
      databasePath: testDb.path,
      localUserId: testDb.localUserId,
    },
  });

  const conversationIds: string[] = [];
  for (let i = 0; i < concurrency; i += 1) {
    const created = await app.inject({
      method: "POST",
      url: "/api/conversations",
      payload: { title: `Load ${i}` },
    });
    conversationIds.push(created.json().data.id as string);
  }

  const latencies: number[] = [];
  let errors = 0;
  const started = performance.now();

  for (let round = 0; round < iterations; round += 1) {
    await Promise.all(
      conversationIds.map(async (conversationId) => {
        const t = performance.now();
        try {
          const res = await app.inject({
            method: "POST",
            url: "/api/agent/turn",
            payload: {
              conversationId,
              message: `Ping ${round}`,
              timeZone: "Asia/Kolkata",
            },
          });
          latencies.push(performance.now() - t);
          if (res.statusCode >= 400) errors += 1;
        } catch {
          errors += 1;
          latencies.push(performance.now() - t);
        }
      }),
    );
  }

  const wallMs = performance.now() - started;
  const stats = summarizeLatencies(latencies);
  const snapshot = getMetricsRegistry(perf).snapshot();

  await app.close();
  await testDb.cleanup();

  return {
    label,
    mode: "mocked",
    gitCommit: gitSha(env.ROOT_DIR),
    config: perfConfigSnapshot(perf),
    concurrency,
    iterations,
    totalRequests: latencies.length,
    wallMs,
    requestsPerSecond: latencies.length / (wallMs / 1000),
    errors,
    errorRate: latencies.length ? errors / latencies.length : null,
    latency: stats,
    metrics: snapshot,
    sampleSize: latencies.length,
    lowConfidence: stats.lowConfidence,
  };
}

function writeReport(
  root: string,
  kind: "baseline" | "optimized" | "comparisons" | "smoke" | "load",
  label: string,
  report: unknown,
): string {
  const dir = resolve(root, "reports/performance", kind, label);
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, "summary.json");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const md = [
    `# Performance report — ${kind}/${label}`,
    ``,
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    ``,
  ].join("\n");
  writeFileSync(join(dir, "summary.md"), md);
  return jsonPath;
}

function compareReports(aPath: string, bPath: string) {
  const a = JSON.parse(readFileSync(aPath, "utf8")) as {
    agentTurns?: {
      latency?: { averageMs?: number | null };
      searchCalls?: number[];
      secondTurnAvoidedSearch?: boolean;
    };
    latency?: { averageMs?: number | null };
    searchCache?: {
      warmHit?: boolean;
      coldMs?: number;
      warmMs?: number;
      speedupRatio?: number | null;
      timestampsPreserved?: boolean;
    };
    sampleSize?: number;
    lowConfidence?: boolean;
  };
  const b = JSON.parse(readFileSync(bPath, "utf8")) as typeof a;
  const aAvg =
    a.agentTurns?.latency?.averageMs ?? a.latency?.averageMs ?? null;
  const bAvg =
    b.agentTurns?.latency?.averageMs ?? b.latency?.averageMs ?? null;
  return {
    baselineAvgMs: aAvg,
    currentAvgMs: bAvg,
    deltaMs: aAvg != null && bAvg != null ? bAvg - aAvg : null,
    note:
      "Agent-turn wall times are mock-dominated and low-confidence at n=2; prefer searchCache.speedupRatio and searchCalls.",
    warmCacheHitBaseline: a.searchCache?.warmHit ?? null,
    warmCacheHitCurrent: b.searchCache?.warmHit ?? null,
    searchColdMs: b.searchCache?.coldMs ?? a.searchCache?.coldMs ?? null,
    searchWarmMs: b.searchCache?.warmMs ?? a.searchCache?.warmMs ?? null,
    searchCacheSpeedup: b.searchCache?.speedupRatio ?? a.searchCache?.speedupRatio ?? null,
    timestampsPreserved:
      b.searchCache?.timestampsPreserved ?? a.searchCache?.timestampsPreserved ?? null,
    secondTurnAvoidedSearch:
      b.agentTurns?.secondTurnAvoidedSearch ??
      a.agentTurns?.secondTurnAvoidedSearch ??
      null,
    baselineSearchCalls: a.agentTurns?.searchCalls ?? null,
    currentSearchCalls: b.agentTurns?.searchCalls ?? null,
    sampleSize: {
      baseline: a.sampleSize ?? null,
      current: b.sampleSize ?? null,
    },
    lowConfidence: Boolean(a.lowConfidence || b.lowConfidence),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      `perf CLI\n  perf:baseline | perf:smoke | perf:load | perf:report | perf:compare\n`,
    );
    process.exit(0);
  }

  const env = loadEnvironment({ NODE_ENV: "test" });
  const label =
    args.label ?? new Date().toISOString().replace(/[:.]/g, "-");

  if (
    args.command === "perf:baseline" ||
    args.command === "perf:smoke" ||
    args.command === "perf:optimized"
  ) {
    const kind =
      args.command === "perf:baseline"
        ? "baseline"
        : args.command === "perf:optimized"
          ? "optimized"
          : "smoke";
    const report = await runSmokeSuite(label);
    const path = writeReport(env.ROOT_DIR, kind, label, report);
    process.stdout.write(`Wrote ${path}\n`);
    process.stdout.write(
      `warmCacheHit=${report.searchCache.warmHit} timestampsPreserved=${report.searchCache.timestampsPreserved}\n`,
    );
    process.exit(report.agentTurns.statusCodes.every((c) => c === 200) ? 0 : 1);
  }

  if (args.command === "perf:load") {
    const report = await runLoadSuite(
      label,
      args.concurrency ?? 4,
      args.iterations ?? 3,
    );
    const path = writeReport(env.ROOT_DIR, "load", label, report);
    process.stdout.write(`Wrote ${path}\n`);
    process.stdout.write(
      `rps=${report.requestsPerSecond.toFixed(2)} errorRate=${report.errorRate}\n`,
    );
    process.exit((report.errorRate ?? 1) > 0.05 ? 1 : 0);
  }

  if (args.command === "perf:compare") {
    const baseDir = resolve(env.ROOT_DIR, "reports/performance/baseline");
    const optDir = resolve(env.ROOT_DIR, "reports/performance/optimized");
    if (!existsSync(baseDir) || !existsSync(optDir)) {
      throw new Error("Need reports/performance/baseline and optimized");
    }
    const baseLabel = readdirSync(baseDir).sort().at(-1);
    const optLabel = readdirSync(optDir).sort().at(-1);
    if (!baseLabel || !optLabel) throw new Error("Missing reports");
    const diff = compareReports(
      join(baseDir, baseLabel, "summary.json"),
      join(optDir, optLabel, "summary.json"),
    );
    const out = writeReport(env.ROOT_DIR, "comparisons", label, diff);
    process.stdout.write(JSON.stringify(diff, null, 2) + `\nWrote ${out}\n`);
    process.exit(0);
  }

  if (args.command === "perf:report") {
    process.stdout.write(
      `See reports/performance/* — use perf:baseline then perf:compare\n`,
    );
    process.exit(0);
  }

  throw new Error(`Unknown command ${args.command}`);
}

main().catch((error) => {
  process.stderr.write(
    `perf failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
