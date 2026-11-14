# API overview

Base path: `/api`. Responses use `{ success, data }` or `{ success: false, error: { code, message } }`.

Mutating requests in `AUTH_MODE=session` require cookie session + `X-CSRF-Token` and an allowlisted `Origin`.

## Health

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/health` | public |
| GET | `/api/health/db` | public |
| GET | `/api/health/ready` | public |
| GET | `/api/health/metrics` | non-production |

## Auth

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | email/password → session cookie + csrf |
| POST | `/api/auth/logout` | revoke current |
| POST | `/api/auth/logout-all` | revoke all |
| GET | `/api/auth/session` | current session |
| GET | `/api/auth/csrf` | refresh CSRF |
| GET | `/api/auth/me` | profile |
| POST | `/api/auth/change-password` | rotates other sessions |
| GET/DELETE | `/api/auth/sessions` | list / revoke |

## Account privacy

| Method | Path |
| --- | --- |
| GET | `/api/account/export` |
| DELETE | `/api/account/data` | body `{ confirm: "DELETE", password }` |

## Conversations

`/api/conversations` CRUD + `/messages`, `/summary`, `/memory/process`

## Agent

| Method | Path |
| --- | --- |
| POST | `/api/agent/turn` |
| POST | `/api/agent/turn/stream` | SSE |
| GET | `/api/agent/runs/:id` |

Body includes `conversationId`, `message`, optional `timeZone`, `clientRequestId`.

## Research / memory / temporal / evidence

- `POST /api/research/search`, snapshot/source GETs
- `/api/memory/*` overview, search, facts, projects, preferences, consolidate
- `/api/temporal/*` comparisons, claims, timelines, preview
- `/api/evidence/*` sources, claims, verification, snapshot reports

All resource routes derive `userId` from the authenticated context — never from the client body.
