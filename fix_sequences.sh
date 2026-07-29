#!/usr/bin/env bash
# Чинит рассинхрон автоинкремент-счётчиков (sequences) со всеми serial/identity
# колонками БД. Симптом: "duplicate key value violates unique constraint ..._pkey
# ... already exists" при вставке НОВОЙ строки (счётчик отстал от максимума).
#
# Причина обычно: строки заливались с явными id (сидинг/восстановление/ручной
# INSERT), а счётчик не подвинули. Безопасно: двигает только счётчики к текущему
# максимуму, сами данные не меняет. Можно (и полезно) прогонять после restore.
set -euo pipefail

PROJECT_DIR="/opt/centricore"
cd "$PROJECT_DIR"

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U finlife -d finlife -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  r     RECORD;
  seq   TEXT;
  maxid BIGINT;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name   = c.table_name
     AND t.table_type   = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND pg_get_serial_sequence(
            quote_ident(c.table_schema) || '.' || quote_ident(c.table_name),
            c.column_name
          ) IS NOT NULL
  LOOP
    seq := pg_get_serial_sequence(
             quote_ident(r.table_schema) || '.' || quote_ident(r.table_name),
             r.column_name);
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I',
                   r.column_name, r.table_schema, r.table_name)
      INTO maxid;
    IF maxid = 0 THEN
      EXECUTE format('SELECT setval(%L, 1, false)', seq);      -- пустая таблица → next = 1
    ELSE
      EXECUTE format('SELECT setval(%L, %s, true)', seq, maxid); -- next = maxid + 1
    END IF;
    RAISE NOTICE 'seq % -> % (%.%)', seq, maxid, r.table_name, r.column_name;
  END LOOP;
END $$;
SQL

echo "==> Все счётчики выровнены по максимуму."
