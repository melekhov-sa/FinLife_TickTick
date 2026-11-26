"""Подтянуть последовательности таблиц с ручной нумерацией

У пяти таблиц id выдаётся вручную: номер кладётся в событие, а проектор
создаёт строку с этим rule_id/task_id/... явно. Последовательность
Postgres о таких вставках не знает и остаётся позади максимума. Пока в
таблицу вставляют только с явным id, это незаметно; но стоит одному
обработчику вставить без него — и последовательность выдаёт занятый
номер.

Ровно так падало создание планового шаблона:
  duplicate key value violates unique constraint "recurrence_rules_pkey"
  DETAIL: Key (rule_id)=(101) already exists

Обработчик исправлен (теперь он тоже берёт номер у общего генератора), а
эта миграция чинит уже разъехавшееся состояние и заодно страхует любой
путь, который о генераторе забудет.

Идемпотентна: setval просто выставляет значение по текущему максимуму.

Revision ID: seq1a2b3c4d5e
Revises: gv1a2b3c4d5e
"""
from alembic import op

revision = "seq1a2b3c4d5e"
down_revision = "gv1a2b3c4d5e"
branch_labels = None
depends_on = None

# (таблица, колонка первичного ключа)
MANUAL_ID_TABLES = [
    ("habits", "habit_id"),
    ("operation_templates", "template_id"),
    ("recurrence_rules", "rule_id"),
    ("tasks", "task_id"),
    ("task_templates", "template_id"),
]


def upgrade() -> None:
    for table, column in MANUAL_ID_TABLES:
        # pg_get_serial_sequence вернёт NULL, если последовательности нет
        # (колонка не serial) — тогда setval не вызывается вовсе.
        op.execute(
            f"""
            SELECT setval(
                pg_get_serial_sequence('{table}', '{column}'),
                GREATEST(COALESCE((SELECT MAX({column}) FROM {table}), 0), 1)
            )
            WHERE pg_get_serial_sequence('{table}', '{column}') IS NOT NULL
            """
        )


def downgrade() -> None:
    # Откатывать нечего: последовательность лишь догнала реальные данные.
    pass
