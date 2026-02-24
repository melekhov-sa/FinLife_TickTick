"""Add project_analytics_snapshot table

Revision ID: f8g9h0i1j2k3
Revises: e7f8g9h0i1j2
"""
from alembic import op
import sqlalchemy as sa

revision = "f8g9h0i1j2k3"
down_revision = "e7f8g9h0i1j2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_analytics_snapshot",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("calculated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),

        # discipline
        sa.Column("tasks_completed_total", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tasks_completed_on_time", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tasks_completed_late", sa.Integer, nullable=False, server_default="0"),
        sa.Column("discipline_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("overdue_open_count", sa.Integer, nullable=False, server_default="0"),

        # reschedule
        sa.Column("reschedule_count", sa.Integer, nullable=False, server_default="0"),

        # velocity
        sa.Column("velocity_week1", sa.Integer, nullable=False, server_default="0"),
        sa.Column("velocity_week2", sa.Integer, nullable=False, server_default="0"),
        sa.Column("velocity_week3", sa.Integer, nullable=False, server_default="0"),
        sa.Column("velocity_week4", sa.Integer, nullable=False, server_default="0"),
        sa.Column("velocity_week5", sa.Integer, nullable=False, server_default="0"),

        # cycle time
        sa.Column("avg_cycle_time_days", sa.Numeric(6, 2), nullable=False, server_default="0"),

        sa.UniqueConstraint("project_id", "year", "month", name="uq_project_analytics_ym"),
    )


def downgrade() -> None:
    op.drop_table("project_analytics_snapshot")
