#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> Preflight"
command -v node >/dev/null || { echo "Node.js missing"; exit 1; }
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" != "24" ]]; then
  echo "Warning: expected Node 24, found $(node -v)"
fi

test -f .env || { echo "Missing .env — copy .env.example and configure"; exit 1; }
test -f package-lock.json || { echo "Missing package-lock.json"; exit 1; }

# shellcheck disable=SC1091
set -a; source .env; set +a

: "${DATABASE_URL:?DATABASE_URL required (Supabase Postgres connection string)}"
: "${APP_ALLOWED_ORIGINS:?APP_ALLOWED_ORIGINS required}"

if [[ "${NODE_ENV:-}" == "production" && "${AUTH_MODE:-}" != "session" ]]; then
  echo "AUTH_MODE must be session in production"
  exit 1
fi

echo "OK — Node $(node -v), DATABASE_URL set"
