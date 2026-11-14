# Minimi Threat Model

## Assets

- User accounts and password hashes
- Session tokens / CSRF tokens
- Conversations, messages, memory facts, preferences
- Research snapshots, sources, claims, evidence
- Agent runs and tool results
- OpenAI / Tavily API keys

## Entry points

- Browser UI (Vite) → API (`/api/*`, SSE)
- Admin CLI (`auth:bootstrap`)
- Supabase Postgres database and backups
- External content: Tavily results, model outputs

## Trust boundaries

| Zone | Trust |
| --- | --- |
| Browser | Untrusted |
| API process | Trusted compute |
| Postgres (Supabase) | Trusted storage (access controlled by DB credentials / network policy) |
| OpenAI / Tavily | Semi-trusted processors of redacted prompts / queries |
| Search result text | Untrusted evidence |

## Threat actors

- External attacker (network)
- Malicious website (CSRF / XSS)
- Authenticated abusive user
- Compromised dependency
- Prompt-injection via web content

## Attack scenarios & mitigations

| Scenario | Mitigation |
| --- | --- |
| Account takeover | Argon2id, login rate limits, session revocation |
| Session theft | HttpOnly cookies, short idle timeout, hash-at-rest |
| CSRF | CSRF tokens + Origin allowlist + SameSite |
| XSS | rehype-sanitize, CSP, safe URL schemes |
| Cross-user data access | Session identity + ownership filters on every query |
| Prompt injection | Untrusted labeling, tool allowlist, detectors |
| API abuse | Rate limits, body limits, timeouts |
| Credential exposure | Env-only secrets, redaction, no VITE secrets |
| Citation spoofing | Server citation registry ownership |
| Deletion gaps | Cascade FKs + FTS cleanup + session revoke |
| Dependency compromise | `npm run security:audit` / lockfile |

## Residual risks

- Per-process in-memory caches and rate limits (no distributed isolation)
- Heuristic prompt-injection detection is incomplete by nature
- Host filesystem encryption depends on the operator
- In-memory rate limits reset on restart and do not span processes
- Admin bootstrap credentials must be handled out-of-band
