"""add reminder deliveries

Revision ID: rd1a2b3c4d5e
Revises: nf1a2b3c4d5e
Create Date: 2026-11-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'rd1a2b3c4d5e'
down_revision: Union[str, Sequence[str], None] = 'nf1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'reminder_deliveries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('entity_id', sa.Integer(), nullable=False),
        sa.Column('fire_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('sent_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'kind', 'entity_id', 'fire_at', name='uq_reminder_delivery'),
    )
    op.create_index('ix_reminder_deliveries_account_id', 'reminder_deliveries', ['account_id'])
    op.create_index('ix_reminder_deliveries_fire_at', 'reminder_deliveries', ['fire_at'])


def downgrade() -> None:
    op.drop_index('ix_reminder_deliveries_fire_at', table_name='reminder_deliveries')
    op.drop_index('ix_reminder_deliveries_account_id', table_name='reminder_deliveries')
    op.drop_table('reminder_deliveries')
