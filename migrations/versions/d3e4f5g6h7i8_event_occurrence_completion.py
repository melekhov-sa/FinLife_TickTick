"""event occurrence completion: add completion_mode to events, is_completed to event_occurrences

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-05-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3e4f5g6h7i8'
down_revision = 'c2d3e4f5g6h7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Event-level: how occurrences are auto-completed
    op.add_column(
        "events",
        sa.Column(
            "completion_mode",
            sa.String(20),
            nullable=False,
            server_default="end_of_day",
        ),
    )
    # Occurrence-level: whether the occurrence actually happened
    op.add_column(
        "event_occurrences",
        sa.Column(
            "is_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("event_occurrences", "is_completed")
    op.drop_column("events", "completion_mode")
