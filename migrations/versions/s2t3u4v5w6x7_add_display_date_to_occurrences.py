"""add_display_date_to_occurrences

Revision ID: s2t3u4v5w6x7
Revises: l5m6n7o8p9q0, r0s1t2u3v4w5
Create Date: 2026-05-07

Merges the two existing heads and adds display_date to operation_occurrences
and task_occurrences. scheduled_date stays immutable (used by the generator
for idempotency). display_date, when set, overrides the date shown to the
user — used for rescheduling a single occurrence without breaking the queue.
"""
from typing import Union, Sequence
from alembic import op
import sqlalchemy as sa

revision: str = 's2t3u4v5w6x7'
down_revision: Union[str, Sequence[str]] = ('l5m6n7o8p9q0', 'r0s1t2u3v4w5')
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('operation_occurrences', sa.Column('display_date', sa.Date(), nullable=True))
    op.add_column('task_occurrences',      sa.Column('display_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('operation_occurrences', 'display_date')
    op.drop_column('task_occurrences',      'display_date')
