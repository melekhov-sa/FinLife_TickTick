"""add notification failures

Revision ID: nf1a2b3c4d5e
Revises: er1a2b3c4d5e
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'nf1a2b3c4d5e'
down_revision: Union[str, Sequence[str], None] = 'er1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'notification_failures',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('channel', sa.String(length=16), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('error', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_notification_failures_user_id', 'notification_failures', ['user_id'])
    op.create_index('ix_notification_failures_occurred_at', 'notification_failures', ['occurred_at'])


def downgrade() -> None:
    op.drop_index('ix_notification_failures_occurred_at', table_name='notification_failures')
    op.drop_index('ix_notification_failures_user_id', table_name='notification_failures')
    op.drop_table('notification_failures')
