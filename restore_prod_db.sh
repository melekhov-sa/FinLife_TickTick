#!/usr/bin/env bash
# Восстановление прод-БД FinLife/Centricore из бэкапа.
# Понимает три формата:
#   *.sql             — обычный дамп (быстрый локальный откат);
#   *.sql.gz          — сжатый дамп;
#   *.sql.gz.age      — зашифрованный (нужен ПРИВАТНЫЙ ключ age — только при
#                       восстановлении: env AGE_IDENTITY или ./backup_identity.txt).
#
# ВНИМАНИЕ: перезаписывает содержимое БД (DROP SCHEMA public).
set -euo pipefail

PROJECT_DIR="/opt/centricore"
IDENTITY="${AGE_IDENTITY:-$PROJECT_DIR/backup_identity.txt}"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup файл: .sql | .sql.gz | .sql.gz.age>"
  exit 1
fi
SRC="$1"
[[ -f "$SRC" ]] || { echo "Файл не найден: $SRC"; exit 1; }

cd "$PROJECT_DIR"

# Поток расшифрованного/распакованного SQL в stdout
decode() {
  case "$SRC" in
    *.age)
      if ! command -v age >/dev/null 2>&1; then echo "нет age" >&2; exit 1; fi
      [[ -f "$IDENTITY" ]] || { echo "Нужен приватный ключ age: $IDENTITY (или env AGE_IDENTITY)" >&2; exit 1; }
      age -d -i "$IDENTITY" "$SRC" | gunzip ;;
    *.gz)  gunzip -c "$SRC" ;;
    *)     cat "$SRC" ;;
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
