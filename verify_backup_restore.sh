#!/usr/bin/env bash
set -euo pipefail

# Проверка, что из бэкапа действительно можно подняться.
#
# Дампы уезжают на Яндекс.Диск с августа, но ни один из них ни разу не
# восстанавливали. Бэкап, который не разворачивали, — это гипотеза, а не
# бэкап: битый дамп, забытая таблица или несовместимая версия Postgres
# обнаруживаются ровно в тот момент, когда уже поздно.
#
# Скрипт поднимает временный контейнер Postgres, заливает в него свежий
# дамп, считает таблицы и строки в ключевых из них, и гасит контейнер.
# Рабочую базу не трогает вообще: отдельный контейнер, отдельный том.
#
# Запуск:  ./verify_backup_restore.sh [путь-к-дампу.sql.gz]
# Без аргумента берётся самый свежий из backups/.

PROJECT_DIR="/opt/centricore"
BACKUP_DIR="$PROJECT_DIR/backups"
PG_IMAGE="postgres:16"
TMP_NAME="centricore_restore_check"
TMP_PASS="verify-only-$$"

# Таблицы, пустота которых означает, что бэкап бесполезен,
# даже если формально развернулся.
CRITICAL_TABLES=(event_log transactions_feed wallet_balances tasks)

cleanup() {
  docker rm -f "$TMP_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$BACKUP_DIR"/prod_*.sql.gz 2>/dev/null | head -1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: дамп не найден (искал в $BACKUP_DIR)" >&2
  exit 1
fi

SIZE_MB=$(( $(stat -c%s "$DUMP") / 1024 / 1024 ))
echo "==> Проверяем: $DUMP (${SIZE_MB} МБ)"

# Пустой дамп формально распакуется и развернётся в пустую базу —
# ловим это заранее.
if [[ $(stat -c%s "$DUMP") -lt 10240 ]]; then
  echo "ERROR: дамп подозрительно мал (${SIZE_MB} МБ) — похоже, pg_dump упал" >&2
  exit 1
fi

echo "==> Поднимаем временный $PG_IMAGE"
cleanup
docker run -d --name "$TMP_NAME" \
  -e POSTGRES_PASSWORD="$TMP_PASS" \
  -e POSTGRES_USER=finlife \
  -e POSTGRES_DB=finlife \
  "$PG_IMAGE" >/dev/null

echo "==> Ждём готовности"
for i in {1..60}; do
  if docker exec "$TMP_NAME" pg_isready -U finlife -d finlife >/dev/null 2>&1; then
    break
  fi
  sleep 1
  if [[ $i -eq 60 ]]; then
    echo "ERROR: контейнер не поднялся за 60 секунд" >&2
    exit 1
  fi
done

echo "==> Восстанавливаем"
if ! gunzip -c "$DUMP" | docker exec -i "$TMP_NAME" psql -U finlife -d finlife -q -v ON_ERROR_STOP=1 >/dev/null; then
  echo "ERROR: восстановление упало — бэкап непригоден" >&2
  exit 1
fi

q() { docker exec -i "$TMP_NAME" psql -U finlife -d finlife -tAc "$1"; }

TABLES=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
echo "==> Таблиц восстановлено: $TABLES"
if [[ "$TABLES" -lt 50 ]]; then
  echo "ERROR: таблиц меньше полусотни — дамп неполный" >&2
  exit 1
fi

FAILED=0
for t in "${CRITICAL_TABLES[@]}"; do
  if [[ "$(q "SELECT to_regclass('public.$t') IS NOT NULL;")" != "t" ]]; then
    echo "ERROR: нет таблицы $t" >&2
    FAILED=1
    continue
  fi
  rows=$(q "SELECT count(*) FROM $t;")
  echo "    $t: $rows строк"
  if [[ "$rows" -eq 0 ]]; then
    echo "ERROR: таблица $t пуста" >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "==> ПРОВЕРКА НЕ ПРОЙДЕНА" >&2
  exit 1
fi

echo "==> OK: бэкап разворачивается, данные на месте"
