#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:3001}"

curl -fsS "$BASE/api/health" >/dev/null
curl -fsS "$BASE/api/health/ready" >/dev/null
echo "Health OK ($BASE)"
