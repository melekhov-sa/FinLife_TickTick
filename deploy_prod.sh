#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/opt/centricore"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:8000/ready"

cd "$PROJECT_DIR"

echo "==> 0) Current git"
git rev-parse --short HEAD || true
git status -sb || true

echo "==> 1) Backup PROD DB"
if [[ -x "/opt/centricore/backup_prod_db.sh" ]]; then
  /opt/centricore/backup_prod_db.sh
else
  echo "ERROR: /opt/centricore/backup_prod_db.sh not found or not executable"
  exit 1
fi

echo "==> 2) Pull latest code"
git fetch --all --prune
git pull --ff-only

echo "==> 3) Build & restart"
docker compose -f "$COMPOSE_FILE" up -d --build

echo "==> 4) Wait health: $HEALTH_URL"
for i in {1..30}; do
  code="$(curl -sS -o /dev/null -w "%{http_code}" "$HEALTH_URL" || true)"
  if [[ "$code" == "200" ]]; then
    echo "==> OK: healthy (200)"
    exit 0
  fi
  echo "==> not ready yet (code=$code), retry $i/30..."
  sleep 2
done

echo "==> ERROR: health check failed"
echo "==> Last logs (app):"
docker compose -f "$COMPOSE_FILE" logs --tail 200 app || true
exit 1
