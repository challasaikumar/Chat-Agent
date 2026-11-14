# Design — Minimi Research Agent

Minimi is a conversational research agent with persistent memory, one external tool (`web_search`), evidence verification, and deterministic temporal comparison. It is aimed at research follow-ups such as CRM pricing changes, recalling a prior conversation date, and comparing hosting plans over time—not at unconstrained general browsing.

A user message is persisted under the authenticated owner, then a ContextBuilder loads recent messages, ranked memory facts, and prior research snapshots. When the turn looks comparative, TemporalService resolves dates and historical baselines. The OpenAI Responses API may call `web_search`; the backend executes Tavily, stores a research snapshot, runs claim/evidence checks, and optionally a deterministic ComparisonEngine. Citations are resolved only from a server-side registry. The final answer is streamed over SSE, persisted, and may trigger thresholded memory ingestion.

## Why this architecture

A TypeScript modular monolith (Fastify API + React/Vite + shared Zod contracts) keeps boundaries reviewable without microservice overhead. Supabase Postgres + Drizzle + Postgres full-text search give durable managed storage with low ops cost. Conversational memory stays separate from research memory: original messages remain the source of truth; durable facts carry provenance and versioning. Memory retrieval is an internal ContextBuilder concern, not a second model tool, so the agent cannot invent new capabilities. Exactly one external tool (`web_search`) keeps the tool loop bounded, auditable, and cheaper to reason about. SSE gives low time-to-first-token without WebSocket complexity. Temporal comparisons use deterministic price/plan logic so the model cannot invent arithmetic. Evidence quality (source suitability) is scored separately from claim support so authority and factuality are never collapsed into one fake probability.

## Important decisions

Messages are never overwritten by memory. Confirmed facts supersede prior versions instead of mutating history. Tool execution, citation IDs, and ownership checks are backend-enforced—knowing a UUID does not grant access. Search results are untrusted evidence; prompt-injection heuristics label suspicious content without discarding legitimate facts. Auth uses Argon2id and opaque DB sessions with CSRF; production forbids `LOCAL_USER_ID` identity. Performance work (TTL/LRU search cache, concurrency gates, SSE backpressure) reduces avoidable cost while preserving original `retrievedAt` timestamps on cache hits.

## Trade-offs and rejected approaches

The app originally used SQLite and now runs on Supabase Postgres (managed, multi-instance friendly); in-process caches and rate limits remain per-instance. A modular monolith beat microservices for hiring-challenge clarity. No vector database: Postgres full-text search + heuristic ranking are enough to start and stay explainable. The model does not get arbitrary HTTP, SQL, or shell access. The tool loop is capped (iterations/searches/timeouts). Deterministic graders, not an LLM judge alone, gate regressions for prices, dates, and citations. Redis/Kubernetes were rejected without measured need.

Authentication is invite-only by default: public registration stays disabled, sessions are database-backed and hashed at rest, and CSRF plus an origin allowlist protect cookie-authenticated mutations (including SSE). Evaluation datasets under `evals/` make CRM, November-3 recall, and Postgres pricing regressions measurable without live provider spend.

## Another week

Expand golden benchmarks for memory precision/recall and temporal edge cases; harden source verification against thin marketing pages; add optional Postgres when multi-instance writes are required; tighten dependency upgrades for current audit advisories; and improve demo fixtures that clearly separate seeded history from live search.
