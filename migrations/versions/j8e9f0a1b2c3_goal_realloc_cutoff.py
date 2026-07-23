"""Рубеж отсечения для учёта переносов цель→цель в бюджете

Переносы между целями (SAVINGS→SAVINGS) начинают влиять на бюджет только
для операций, созданных ПОСЛЕ обновления. Иначе исторические месяцы, где
юзер уже вручную свёл цифры, поплыли бы. Рубеж = максимальный
transaction_id на момент деплоя; считаем только переносы с id больше него.

Revision ID: j8e9f0a1b2c3
Revises: i7d8e9f0a1b2
"""
from alembic import op

revision = "j8e9f0a1b2c3"
down_revision = "i7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO app_config (key, value)
        VALUES (
            'goal_realloc_cutoff_tx_id',
            (SELECT COALESCE(MAX(transaction_id), 0)::text FROM transactions_feed)
        )
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM app_config WHERE key = 'goal_realloc_cutoff_tx_id'")
