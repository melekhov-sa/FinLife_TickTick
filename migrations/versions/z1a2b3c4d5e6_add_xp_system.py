"""add xp system tables (user_xp_state, xp_events)

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-02-19 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'z1a2b3c4d5e6'
down_revision: str = 'y0z1a2b3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_xp_state',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('total_xp', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_level_xp', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('xp_to_next_level', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('user_id'),
    )

    op.create_table(
        'xp_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('source_event_id', sa.Integer(), nullable=False),
        sa.Column('xp_amount', sa.Integer(), nullable=False),
        sa.Column('reason', sa.String(64), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_event_id', name='uq_xp_events_source_event_id'),
    )
    op.create_index('ix_xp_events_user_id', 'xp_events', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_xp_events_user_id', table_name='xp_events')
    op.drop_table('xp_events')
    op.drop_table('user_xp_state')
