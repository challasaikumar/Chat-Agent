#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

BACKUP="${1:-}"
if [[ -z "$BACKUP" || ! -f "$BACKUP" ]]; then
  echo "Usage: restore-db.sh /path/to/backup.dump"
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a
: "${DATABASE_URL:?DATABASE_URL required}"
command -v pg_restore >/dev/null || { echo "pg_restore missing (install postgresql-client)"; exit 1; }

echo "Stopping writers is required before restore (systemctl stop minimi)."
echo "This REPLACES objects in the target database. Press Ctrl-C within 10s to abort."
sleep 10

pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$BACKUP"
echo "Restored $BACKUP"
