"""add error events

Revision ID: er1a2b3c4d5e
Revises: bs1a2b3c4d5e
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'er1a2b3c4d5e'
down_revision: Union[str, Sequence[str], None] = 'bs1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'error_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('method', sa.String(length=10), nullable=False),
        sa.Column('path', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_error_events_occurred_at', 'error_events', ['occurred_at'])


def downgrade() -> None:
    op.drop_index('ix_error_events_occurred_at', table_name='error_events')
    op.drop_table('error_events')
