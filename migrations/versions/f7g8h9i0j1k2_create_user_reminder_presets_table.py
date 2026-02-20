"""create user_reminder_time_presets table

Revision ID: f7g8h9i0j1k2
Revises: e6f7g8h9i0j1
Create Date: 2026-02-20 12:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f7g8h9i0j1k2'
down_revision: str = 'e6f7g8h9i0j1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_reminder_time_presets',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('label', sa.String(64), nullable=False),
        sa.Column('offset_minutes', sa.Integer(), nullable=False),
        sa.Column('sort_order', sa.SmallInteger(), server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('account_id', 'offset_minutes', name='uq_user_reminder_preset'),
    )


def downgrade() -> None:
    op.drop_table('user_reminder_time_presets')
