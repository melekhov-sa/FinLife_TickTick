"""Вердикты точности плана: ручная оценка выбивающихся из плана статей

Недорасход больше коридора юзер помечает: FIT («сэкономил, вписался») или
MISS («реально мимо»). Перерасход — всегда промах, вердикт не нужен.

Revision ID: k9f0a1b2c3d4
Revises: j8e9f0a1b2c3
"""
import sqlalchemy as sa
from alembic import op

revision = "k9f0a1b2c3d4"
down_revision = "j8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_accuracy_verdicts",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("category_id", sa.Integer, nullable=False),
        sa.Column("verdict", sa.String(8), nullable=False),  # FIT | MISS
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.UniqueConstraint(
            "account_id", "year", "month", "category_id",
            name="uq_plan_accuracy_verdict",
        ),
    )
    op.create_index(
        "ix_plan_accuracy_verdicts_account", "plan_accuracy_verdicts", ["account_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_plan_accuracy_verdicts_account", table_name="plan_accuracy_verdicts")
    op.drop_table("plan_accuracy_verdicts")
