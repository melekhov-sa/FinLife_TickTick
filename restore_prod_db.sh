#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/centricore"

if [[ $# -ne 1 ]]; then
  echo "Usage: /opt/centricore/restore_prod_db.sh /opt/centricore/backups/prod_YYYYmmdd-HHMMSS.sql"
  exit 1
fi

SQL_FILE="$1"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "File not found: $SQL_FILE"
  exit 1
fi

cd "$PROJECT_DIR"

echo "==> Restoring from: $SQL_FILE"
echo "==> (This will overwrite DB contents)"

# Drop and recreate schema (чисто и надёжно)
docker compose -f docker-compose.prod.yml exec -T db psql -U finlife -d finlife -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL

# Restore
cat "$SQL_FILE" | docker compose -f docker-compose.prod.yml exec -T db psql -U finlife -d finlife -v ON_ERROR_STOP=1

echo "==> Restore done"
