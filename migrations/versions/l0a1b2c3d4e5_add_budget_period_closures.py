"""Закрытие статьи/цели за период: «больше сюда не потрачу/не отложу»

Убирает «осталось потратить X» из плана до конца месяца и учитывает это
в прогнозе баланса. entity_type: category | goal | withdrawal.

Revision ID: l0a1b2c3d4e5
Revises: k9f0a1b2c3d4
"""
import sqlalchemy as sa
from alembic import op

revision = "l0a1b2c3d4e5"
down_revision = "k9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "budget_period_closures",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("entity_type", sa.String(16), nullable=False),  # category|goal|withdrawal
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.UniqueConstraint(
            "account_id", "year", "month", "entity_type", "entity_id",
            name="uq_budget_period_closure",
        ),
    )
    op.create_index("ix_budget_period_closures_account", "budget_period_closures", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_budget_period_closures_account", table_name="budget_period_closures")
    op.drop_table("budget_period_closures")
