"""event_task_templates: add is_after_event, minutes_after_end, auto_complete_mode

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5g6h7'
down_revision = 'b1c2d3e4f5g6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_task_templates",
        sa.Column("is_after_event", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "event_task_templates",
        sa.Column("minutes_after_end", sa.Integer(), nullable=True),
    )
    op.add_column(
        "event_task_templates",
        sa.Column("auto_complete_mode", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("event_task_templates", "auto_complete_mode")
    op.drop_column("event_task_templates", "minutes_after_end")
    op.drop_column("event_task_templates", "is_after_event")
