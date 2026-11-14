#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

./deploy/scripts/preflight.sh

echo "==> Install"
npm ci

echo "==> Build"
npm run build

echo "==> Backup database (best effort; Supabase also keeps managed backups)"
if command -v pg_dump >/dev/null; then
  ./deploy/scripts/backup-db.sh || true
fi

echo "==> Migrate"
npm run db:migrate

echo "==> Restart (systemd if available)"
if command -v systemctl >/dev/null && systemctl list-unit-files | grep -q '^minimi.service'; then
  sudo systemctl restart minimi
  sleep 2
  ./deploy/scripts/health-check.sh "http://127.0.0.1:${API_PORT:-3001}"
else
  echo "systemd unit not installed — start manually with: npm run start"
fi

echo "Deploy steps completed"
