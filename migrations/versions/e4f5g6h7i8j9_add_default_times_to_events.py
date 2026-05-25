"""Add default_start_time and default_end_time to events (template-level defaults)

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
Create Date: 2026-05-22
"""
from alembic import op
import sqlalchemy as sa

revision = 'e4f5g6h7i8j9'
down_revision = 'd3e4f5g6h7i8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("default_start_time", sa.Time(), nullable=True),
    )
    op.add_column(
        "events",
        sa.Column("default_end_time", sa.Time(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("events", "default_end_time")
    op.drop_column("events", "default_start_time")
