"""Лог подсказок категорий — обучение на исправлениях юзера

Пишется при создании операции: что подсказали и что юзер выбрал.
Движок штрафует повторение своих ошибок на похожих операциях.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""
import sqlalchemy as sa
from alembic import op

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_suggest_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("operation_type", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("wallet_id", sa.Integer, nullable=True),
        sa.Column("suggested_category_id", sa.Integer, nullable=False),
        sa.Column("chosen_category_id", sa.Integer, nullable=True),
        sa.Column("accepted", sa.Boolean, nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_category_suggest_log_account_id", "category_suggest_log", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_category_suggest_log_account_id", table_name="category_suggest_log")
    op.drop_table("category_suggest_log")
