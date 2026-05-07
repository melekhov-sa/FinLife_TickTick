"""add_display_date_to_occurrences

Revision ID: a1b2c3d4e5f6
Revises: z9a0b1c2d3e4
Create Date: 2026-05-07

Adds display_date to operation_occurrences and task_occurrences.
scheduled_date stays immutable (used by generator for idempotency check).
display_date, when set, overrides the date shown to the user — used for
rescheduling a single occurrence without breaking the recurrence queue.
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z9a0b1c2d3e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('operation_occurrences', sa.Column('display_date', sa.Date(), nullable=True))
    op.add_column('task_occurrences',      sa.Column('display_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('operation_occurrences', 'display_date')
    op.drop_column('task_occurrences',      'display_date')
