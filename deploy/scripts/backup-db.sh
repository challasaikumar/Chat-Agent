#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DATABASE_URL:?DATABASE_URL required}"
command -v pg_dump >/dev/null || { echo "pg_dump missing (install postgresql-client)"; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/data/backups}"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/minimi-$STAMP.dump"

# Logical backup (custom format). Use the direct / Session-pooler URL (5432), not the 6543 transaction pooler.
# Supabase also keeps managed daily backups / PITR — see Dashboard → Database → Backups.
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$DATABASE_URL"
echo "Backup written → $OUT"
