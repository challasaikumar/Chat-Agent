# Minimi Privacy

## What is stored

- Account profile (email, display name, role)
- Conversations and messages
- Long-term memory facts, preferences, project context
- Research snapshots/sources/claims and evidence assessments
- Temporal comparisons and agent run metadata
- Security audit events (hashed IP/UA, action metadata — not full message bodies)

## Why memory is stored

Memory preserves durable user facts (preferences, project decisions) so later turns remain consistent without re-asking. Facts keep provenance (conversation/message references) where available.

## Inspection & correction

Users can list, correct, and retract memory facts via `/api/memory/*` UI/API flows. Provenance fields show where a fact originated.

## Export & deletion

- `GET /api/account/export` — JSON export of the authenticated user’s data (no password hashes or session tokens).
- `DELETE /api/account/data` — requires password + `confirm: "DELETE"`; revokes sessions; cascades user-owned rows; cleans FTS maps.

## Retention

Operational data remains until the user deletes it or an operator purges the database. Audit events may retain minimal metadata after account deletion (no conversation bodies). Local backups retain data until those backup files are deleted — document backup retention with your host.

## External processors

- **OpenAI**: prompts/context for agent turns and optional memory extraction.
- **Tavily**: search queries and returned public web excerpts.

Do not send passwords or API keys in chat. Memory extraction rejects credential-like strings, but detection is heuristic.

## Limitations

Backups and OS-level snapshots are outside the application’s delete API. Encryption at rest is a host/filesystem responsibility unless separately implemented.
