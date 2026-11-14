# Final repository audit — Phase 12

**Date:** 2026-11-13  
**Scope:** Phases 01–11 implementation as present in the workspace  
**Method:** Code inspection + automated suite execution

## Findings

### Critical (fixed)

| ID | Finding | Resolution |
| --- | --- | --- |
| C1 | `applyMigrations()` opened a second SQLite connection and closed it on API boot, risking connection/lifecycle confusion with the process singleton | Migrate on the shared handle; CLI still owns/closes its connection |
| C2 | Missing root `npm run start` for production compiled API | Added root `start` → `@minimi/api` |
| C3 | Production bind default `0.0.0.0` undocumented for Nginx setups | Added `API_HOST` (document `127.0.0.1` behind proxy) |
| C4 | Clean clone failed: `@minimi/shared` dist missing / stale `tsbuildinfo` | `postinstall` builds shared; build clears tsbuildinfo |
| C5 | Parallel Vitest workers locked shared `data/minimi.db` singleton | Lazy DB + per-pid temp path under test |

### High

| ID | Finding | Status |
| --- | --- | --- |
| H1 | `npm audit`: drizzle-orm identifier escaping (GHSA-gpj5-g38j-94v9), zod memory exhaustion (GHSA-mrhx-c7xc-m3w5) | **Open** — force upgrades are breaking; app uses parameterized queries for user values; tracked |
| H2 | No public Git remote / no commits yet | **Open** — repo prepared locally; publish requires user authorization |
| H3 | Live VPS deployment not executed in this phase | **Open** — configs under `deploy/`; not DEPLOYED |

### Medium

| ID | Finding | Status |
| --- | --- | --- |
| M1 | Entity/project list endpoints may expose shared entity catalog beyond user-scoped facts | Informational / follow-up isolation hardening |
| M2 | DESIGN.md had grown far beyond one page across phases | Fixed — rewritten ~500 words |
| M3 | Screenshots directory empty (capture guide only) | Pending operator capture |
| M4 | Git history empty (`No commits yet on main`) | Operator should create meaningful commits before publish |

### Low / Informational

| ID | Finding |
| --- | --- |
| L1 | In-memory rate limits / search cache are single-process |
| L2 | Prompt-injection detection is heuristic |
| L3 | `data/minimi.db` exists locally — gitignored; do not commit |
| L4 | CI workflow present; not claimed green until GitHub Actions runs on a remote |

## Capability verification (code + tests)

| Area | Implemented | Tested |
| --- | --- | --- |
| Conversations / memory / research / agent / temporal / evidence | Yes | Yes (unit/integration + eval) |
| Streaming SSE | Yes | Yes |
| Auth / CSRF / isolation / deletion | Yes | Yes (`tests/security/*`) |
| Performance cache / concurrency | Yes | Yes (`perf:smoke`) |
| Evaluation goldens | Yes | Yes (`npm run eval` 12/12) |
| Production Nginx/systemd | Config only | Not live-deployed |
| Demo video | Script only | Not recorded |

## Secrets scan

- `.env` gitignored; `.env.example` keys empty
- No production credentials found in tracked source
- Test fixtures use fake `sk-` / `tvly-` placeholders
