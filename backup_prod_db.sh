#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/centricore"
BACKUP_DIR="/opt/centricore/backups"

cd "$PROJECT_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/prod_${TS}.sql"

mkdir -p "$BACKUP_DIR"

echo "==> Backup to: $OUT"
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U finlife -d finlife --no-owner --no-privileges > "$OUT"

echo "==> Done"
ls -lh "$OUT"
