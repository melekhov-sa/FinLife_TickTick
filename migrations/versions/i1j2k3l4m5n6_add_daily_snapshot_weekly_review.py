"""add strategic_daily_snapshot and strategic_weekly_review tables

Revision ID: i1j2k3l4m5n6
Revises: h0i1j2k3l4m5
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "i1j2k3l4m5n6"
down_revision = "h0i1j2k3l4m5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "strategic_daily_snapshot",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("life_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("finance_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("discipline_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("project_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("focus_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("account_id", "date", name="uq_strategic_daily_ad"),
    )

    op.create_table(
        "strategic_weekly_review",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("week_number", sa.Integer, nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("life_score_avg", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("finance_avg", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("discipline_avg", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("project_avg", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("focus_avg", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("main_problem", sa.Text, nullable=True),
        sa.Column("improvement_trend", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.UniqueConstraint("account_id", "year", "week_number", name="uq_strategic_weekly_ayw"),
    )


def downgrade() -> None:
    op.drop_table("strategic_weekly_review")
    op.drop_table("strategic_daily_snapshot")
