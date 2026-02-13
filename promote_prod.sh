#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./promote_prod.sh <git_ref>
# Example:
#   ./promote_prod.sh release-20260213-1017
#   ./promote_prod.sh a1b2c3d

REF="${1:-}"

if [ -z "$REF" ]; then
  echo "Usage: $0 <git_ref>"
  exit 1
fi

cd /opt/centricore

echo "==> 1) Backup PROD DB"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p /opt/centricore/backups
docker exec -t centricore_db pg_dump -U finlife -d finlife > "/opt/centricore/backups/prod_${TS}.sql"
echo "Backup saved: /opt/centricore/backups/prod_${TS}.sql"

echo "==> 2) Update code to $REF"
git fetch --all --tags
git checkout -f "$REF"

echo "==> 3) Rebuild + restart PROD stack"
docker compose -f docker-compose.prod.yml up -d --build

echo "==> 4) Show status"
docker ps | grep -E 'centricore_app|centricore_db|centricore_caddy' || true

echo "DONE"
