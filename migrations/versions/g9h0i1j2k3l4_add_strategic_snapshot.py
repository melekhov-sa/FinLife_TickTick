"""add strategic_month_snapshot table

Revision ID: g9h0i1j2k3l4
Revises: f8g9h0i1j2k3
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "g9h0i1j2k3l4"
down_revision = "f8g9h0i1j2k3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "strategic_month_snapshot",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("calculated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),

        # Finance
        sa.Column("assets_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("debt_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("debt_ratio", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("savings_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("income_mtd", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("expense_mtd", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("savings_rate", sa.Numeric(6, 2), nullable=False, server_default="0"),

        # Projects
        sa.Column("active_projects_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("projects_avg_discipline", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("projects_overdue_total", sa.Integer, nullable=False, server_default="0"),

        # Discipline
        sa.Column("global_discipline_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),

        # Focus
        sa.Column("in_progress_total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("focus_score", sa.Numeric(6, 2), nullable=False, server_default="0"),

        # Scores
        sa.Column("finance_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("discipline_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("project_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("life_score", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("life_score_projection", sa.Numeric(6, 2), nullable=False, server_default="0"),

        sa.UniqueConstraint("account_id", "year", "month", name="uq_strategic_snapshot_aym"),
    )


def downgrade() -> None:
    op.drop_table("strategic_month_snapshot")
