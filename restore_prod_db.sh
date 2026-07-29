#!/usr/bin/env bash
# Восстановление прод-БД FinLife/Centricore из бэкапа (.sql или .sql.gz).
# ВНИМАНИЕ: перезаписывает содержимое БД (DROP SCHEMA public).
set -euo pipefail

PROJECT_DIR="/opt/centricore"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup файл: .sql | .sql.gz>"
  exit 1
fi
SRC="$1"
[[ -f "$SRC" ]] || { echo "Файл не найден: $SRC"; exit 1; }

cd "$PROJECT_DIR"

# Поток SQL в stdout (распаковка, если .gz)
decode() {
  case "$SRC" in
    *.gz) gunzip -c "$SRC" ;;
    *)    cat "$SRC" ;;
  esac
}

echo "==> Restore from: $SRC"
echo "==> Это перезапишет БД. Ctrl-C чтобы отменить."; sleep 3

# Чистая схема
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U finlife -d finlife -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL

# Заливка
decode | docker compose -f docker-compose.prod.yml exec -T db \
  psql -U finlife -d finlife -v ON_ERROR_STOP=1

echo "==> Restore done"
