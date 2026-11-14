# Minimi Security

## Authentication

- Email/password with **Argon2id** (`memoryCost=19456`, `timeCost=2`, `parallelism=1`).
- Public registration is **disabled** (`AUTH_REGISTRATION_MODE=disabled`).
- Initial admin: `npm run auth:bootstrap` with `AUTH_BOOTSTRAP_ADMIN_*` env vars (never committed).
- Production requires `AUTH_MODE=session`. `LOCAL_USER_ID` is ignored for identity.

## Sessions

- Opaque random tokens; only SHA-256 hashes stored in `auth_sessions`.
- HttpOnly cookies (`SameSite=Lax`; `Secure` in production / `__Host-` cookies).
- Idle + absolute timeouts; logout / logout-all; revocation; rotation on login.
- Session fixation mitigated by issuing a new session at authentication.

## CSRF & CORS

- Session-bound CSRF tokens via `X-CSRF-Token` on mutating requests.
- Explicit `APP_ALLOWED_ORIGINS` allowlist; credentials never with `*`.
- SSE POST `/api/agent/turn/stream` is CSRF-protected.

## Authorization

- Roles: `user`, `admin`. Default deny.
- Admins may provision accounts; they do **not** automatically read other users’ conversations.
- Every route derives `userId` from the authenticated session (or `local_dev` user). Client-supplied user IDs are never trusted.
- Repositories filter by `userId`; nested resources verify parent ownership.

## API hardening

- Helmet security headers + CSP for API responses.
- Body size limit 1 MiB.
- In-memory rate limits (login, agent, search, export/delete) — single-process only.
- Secrets redacted from logs; health/db path redacted in production.

## AI security

- Single tool: `web_search`.
- Untrusted Tavily content labeled; heuristic prompt-injection detection (Phase 07).
- Memory extraction rejects credential-like strings.

## Secrets

- `OPENAI_API_KEY` / `TAVILY_API_KEY` backend-only.
- Never in `VITE_*`, Git, source maps, or evaluation reports.

## Deployment requirements

- HTTPS reverse proxy; `AUTH_MODE=session`; Secure cookies; strict origins.
- `DATABASE_URL` (Supabase/Postgres credentials) is server-side only; never commit it or expose it to the browser.
- TrustProxy remains off unless the proxy boundary is explicitly configured.

## Incident basics

1. Revoke sessions (`logout-all` / admin revoke).
2. Rotate API keys and bootstrap credentials.
3. Inspect `audit_events` for login failures and CSRF denials.
4. Restore from a Supabase backup / `pg_dump` if needed.

## Dependency audit (Phase 11)

`npm run security:audit` currently reports high advisories in `drizzle-orm` (<0.45.2 identifier escaping) and `zod` (<4.6.6 memory exhaustion). Fixes are major/breaking; do **not** `npm audit fix --force` without a dedicated upgrade + regression pass. Tracked as residual risk — application SQL uses parameterized Drizzle queries / bound values for user input.

## Limitations

In-memory rate limits are per-process. Authentication alone does not provide HA or horizontal scaling.
