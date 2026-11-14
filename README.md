# Minimi Research Agent

Conversational research agent with **persistent memory**, **web search**, **evidence verification**, and **temporal comparison**. Minimi can recall prior conversations, search the live web via Tavily, compare historical findings to current evidence, and return citation-backed answers.

The agent exposes exactly one external model tool: `web_search`.

> Answers are evidence-backed, not guaranteed always accurate. Source quality and claim support are assessed separately; uncertainty is preserved when evidence is weak.

## Problem

Chatbots that only search “today” forget last week’s research. Pure RAG systems often mix conversational memory with web evidence. Minimi separates those concerns and makes historical vs current comparison explicit and testable.

## Key capabilities

- Persistent conversations and message history (FTS5 search)
- Long-term memory (facts, preferences, projects, versioning)
- Tavily web research with persisted snapshots/sources
- OpenAI Responses API orchestration with a bounded tool loop
- Deterministic temporal comparisons (e.g. pricing / plan changes)
- Evidence assessment, claim verification, server-side citations
- SSE streaming chat UI with stop/cancel
- Deterministic evaluation suite + performance smoke tests
- Session auth, CSRF, ownership isolation, export/delete

## Architecture

```
Browser (React/Vite)
    │ HTTPS / same-origin /api
    ▼
Fastify API
  ├─ Auth / sessions / CSRF
  ├─ AgentOrchestrator ──► OpenAI Responses API
  │         │                    │
  │         └─ web_search ──► Tavily adapter
  ├─ ContextBuilder (memory + research + dates)
  ├─ Temporal + Evidence engines
  └─ Supabase Postgres (Drizzle + postgres.js + tsvector FTS)
```

See [docs/architecture.md](docs/architecture.md) for a Mermaid diagram and module boundaries.

### Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript |
| Backend | Node.js 24, Fastify, TypeScript |
| AI | OpenAI Responses API |
| Search | Tavily (provider-abstracted) |
| DB | Supabase Postgres, Drizzle, postgres.js, tsvector/GIN FTS |
| Streaming | SSE |
| Tests | Vitest |
| Packages | npm workspaces |

## Quick start

Requires **Node.js 24** (see `.nvmrc`).

```bash
npm install   # also builds @minimi/shared (postinstall)
cp .env.example .env
npm run dev
```

`postinstall` compiles `packages/shared` so typecheck/tests resolve `@minimi/shared` after a clean clone.

- API: `http://localhost:3001`
- Web: `http://localhost:5173` (proxies `/api`)

**API keys are optional for startup.** Health checks, auth (local_dev), conversations, and migrations work without keys. Agent turns and live search return clear configuration errors until `OPENAI_API_KEY` / `TAVILY_API_KEY` are set.

Default `AUTH_MODE=local_dev` uses `LOCAL_USER_ID` for single-user development. Production must use `AUTH_MODE=session` and `npm run auth:bootstrap`.

## Environment

All variables are listed in [`.env.example`](.env.example). Required for live research:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Agent + optional memory extraction |
| `TAVILY_API_KEY` | Web search |
| `OPENAI_MODEL` | Default `gpt-4.1-mini` |

Never put secrets in `VITE_*` variables.

## Commands

```bash
npm run dev           # shared + API + web
npm run build         # production builds
npm run start         # run compiled API (after build)
npm run typecheck
npm test
npm run db:migrate
npm run eval          # deterministic evaluations (no live keys)
npm run perf:smoke
npm run security:audit
npm run auth:bootstrap
```

## Testing & evaluation

- Unit/integration: `npm test`
- Golden scenarios (CRM / Nov 3 / Postgres): `npm run eval`
- Performance smoke (mocked providers): `npm run perf:smoke`
- Reports: `reports/evaluations/`, `reports/performance/`, `reports/final/`

Live OpenAI/Tavily evals stay opt-in (`EVAL_LIVE_ENABLED=true`).

## Security

See [docs/SECURITY.md](docs/SECURITY.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

Highlights: Argon2id passwords, hashed session cookies, CSRF + origin allowlist, per-user ownership on every repository query, secret redaction, account export/delete.

## Deployment

Long-running Node process (VPS + Nginx, Railway, Render, ...) + Supabase Postgres; the static Vite frontend can be hosted on Vercel. Configurations live under [`deploy/`](deploy/). Guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

The Fastify SSE API is **not** suited to Vercel serverless; keep it a persistent process. In-process caches/rate limits are per-instance.

## Demo

Three hiring scenarios are scripted in [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md):

1. CRM pricing / product updates  
2. November 3 historical recall  
3. Postgres hosting price changes  

## Documentation

| Doc | Contents |
| --- | --- |
| [DESIGN.md](DESIGN.md) | One-page design (hiring requirement) |
| [docs/architecture.md](docs/architecture.md) | System diagram & boundaries |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, Supabase Postgres & migrations |
| [docs/API.md](docs/API.md) | HTTP routes |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | VPS / Nginx / systemd |
| [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) | Ops procedures |
| [docs/PRIVACY.md](docs/PRIVACY.md) | Data handling |
| [docs/SUBMISSION_CHECKLIST.md](docs/SUBMISSION_CHECKLIST.md) | Hiring submission |

## Known limitations

- In-process caches/rate limits are per-instance (no shared store)
- Prompt-injection defenses are heuristic
- Host encryption-at-rest is an operator concern
- npm audit may report dependency advisories requiring careful major upgrades
- Live demo URLs / public repo must be supplied by the operator (not invented here)

## License

Private hiring-challenge submission unless otherwise stated by the author.
# Chat-Agent
