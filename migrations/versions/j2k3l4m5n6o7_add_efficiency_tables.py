"""add efficiency_settings, efficiency_snapshot, efficiency_snapshot_items tables

Revision ID: j2k3l4m5n6o7
Revises: i1j2k3l4m5n6
Create Date: 2026-02-27

"""
from alembic import op
import sqlalchemy as sa

revision = "j2k3l4m5n6o7"
down_revision = "i1j2k3l4m5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "efficiency_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False, unique=True),
        # Weights (normalised to sum=1.0 on save)
        sa.Column("w_ontime", sa.Numeric(5, 3), nullable=False, server_default="0.250"),
        sa.Column("w_overdue", sa.Numeric(5, 3), nullable=False, server_default="0.200"),
        sa.Column("w_reschedule", sa.Numeric(5, 3), nullable=False, server_default="0.150"),
        sa.Column("w_churn", sa.Numeric(5, 3), nullable=False, server_default="0.150"),
        sa.Column("w_wip", sa.Numeric(5, 3), nullable=False, server_default="0.150"),
        sa.Column("w_velocity", sa.Numeric(5, 3), nullable=False, server_default="0.100"),
        # Thresholds: green = best zone, yellow = acceptable
        sa.Column("thr_ontime_green", sa.Numeric(5, 2), nullable=False, server_default="85.0"),
        sa.Column("thr_ontime_yellow", sa.Numeric(5, 2), nullable=False, server_default="70.0"),
        sa.Column("thr_overdue_green", sa.Integer, nullable=False, server_default="3"),
        sa.Column("thr_overdue_yellow", sa.Integer, nullable=False, server_default="7"),
        sa.Column("thr_reschedule_green", sa.Integer, nullable=False, server_default="3"),
        sa.Column("thr_reschedule_yellow", sa.Integer, nullable=False, server_default="7"),
        sa.Column("thr_churn_green", sa.Integer, nullable=False, server_default="2"),
        sa.Column("thr_churn_yellow", sa.Integer, nullable=False, server_default="5"),
        sa.Column("thr_wip_green", sa.Integer, nullable=False, server_default="5"),
        sa.Column("thr_wip_yellow", sa.Integer, nullable=False, server_default="10"),
        sa.Column("thr_velocity_green", sa.Numeric(5, 2), nullable=False, server_default="5.0"),
        sa.Column("thr_velocity_yellow", sa.Numeric(5, 2), nullable=False, server_default="2.0"),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "efficiency_snapshot",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("snapshot_date", sa.Date, nullable=False),
        # Raw metric values
        sa.Column("ontime_rate", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("overdue_open", sa.Integer, nullable=False, server_default="0"),
        sa.Column("reschedule_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("churn_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("wip_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("velocity_7d", sa.Numeric(5, 2), nullable=False, server_default="0"),
        # Normalised sub-scores (0-100)
        sa.Column("s_ontime", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("s_overdue", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("s_reschedule", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("s_churn", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("s_wip", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("s_velocity", sa.Numeric(5, 2), nullable=False, server_default="0"),
        # Composite score
        sa.Column("efficiency_score", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("calculated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("account_id", "snapshot_date", name="uq_efficiency_snapshot_ad"),
    )

    op.create_table(
        "efficiency_snapshot_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("snapshot_id", sa.Integer, sa.ForeignKey("efficiency_snapshot.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_key", sa.String(32), nullable=False),
        sa.Column("task_id", sa.Integer, nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
    )
    op.create_index("ix_eff_snapshot_items_snap_metric", "efficiency_snapshot_items", ["snapshot_id", "metric_key"])


def downgrade() -> None:
    op.drop_index("ix_eff_snapshot_items_snap_metric", "efficiency_snapshot_items")
    op.drop_table("efficiency_snapshot_items")
    op.drop_table("efficiency_snapshot")
    op.drop_table("efficiency_settings")
