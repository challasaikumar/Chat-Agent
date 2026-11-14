# Operations runbook

## Start / stop

```bash
sudo systemctl start minimi
sudo systemctl stop minimi
sudo systemctl restart minimi
sudo systemctl status minimi
```

Dev: `npm run dev` from repo root.

## Logs

```bash
journalctl -u minimi -f
```

Secrets should be redacted; if a key appears, rotate it.

## Health

```bash
./deploy/scripts/health-check.sh http://127.0.0.1:3001
curl -s http://127.0.0.1:3001/api/health/ready
```

## Migrations

1. Backup: `./deploy/scripts/backup-db.sh`
2. Deploy new code + `npm run build`
3. `npm run db:migrate`
4. Restart service
5. Health check

On failure: stop service, restore backup (`./deploy/scripts/restore-db.sh PATH`), investigate migration, retry.

## Backup / restore

See scripts under `deploy/scripts/`. Verify by running `npm run db:migrate` and `/api/health/ready` after restore (Supabase also offers managed backups).

## Secret rotation

1. Update `.env` on server (never commit)
2. Restart `minimi`
3. Rotate OpenAI/Tavily keys in provider consoles
4. For session compromise: users call logout-all; optionally revoke via DB

## Graceful shutdown

SIGTERM/SIGINT flips readiness false, drains agent/streams (bounded), then closes the Postgres pool.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| 503 ready | DB file path/permissions; process crashed |
| CSRF 403 | Origin allowlist; CSRF header after login |
| Agent 502 config | `OPENAI_API_KEY` |
| Search 502 | `TAVILY_API_KEY` |
| Locked DB | second writer process; raise busy_timeout only after fixing contention |
