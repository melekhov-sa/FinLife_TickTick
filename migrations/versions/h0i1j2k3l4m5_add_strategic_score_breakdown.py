"""add strategic_score_breakdown table

Revision ID: h0i1j2k3l4m5
Revises: g9h0i1j2k3l4
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "h0i1j2k3l4m5"
down_revision = "g9h0i1j2k3l4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "strategic_score_breakdown",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "snapshot_id", sa.Integer,
            sa.ForeignKey("strategic_month_snapshot.id", ondelete="CASCADE"),
            nullable=False, index=True,
        ),
        sa.Column("component", sa.String(20), nullable=False),
        sa.Column("metric_key", sa.String(50), nullable=False),
        sa.Column("raw_value", sa.Numeric(14, 2), nullable=True),
        sa.Column("normalized_score", sa.Numeric(6, 2), nullable=False),
        sa.Column("weight", sa.Numeric(6, 3), nullable=False),
        sa.Column("penalty_value", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("penalty_reason", sa.Text, nullable=True),
        sa.Column("link_url", sa.Text, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("strategic_score_breakdown")
