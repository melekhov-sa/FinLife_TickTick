"""add user_activity_daily table

Revision ID: a2b3c4d5e6f7
Revises: z1a2b3c4d5e6
Create Date: 2026-02-19 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: str = 'z1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_activity_daily',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('day_date', sa.Date(), nullable=False),
        sa.Column('ops_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('tasks_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('habits_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('goals_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('points', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('user_id', 'day_date'),
    )
    op.create_index(
        'ix_user_activity_daily_user_id_day_date',
        'user_activity_daily',
        ['user_id', 'day_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_user_activity_daily_user_id_day_date',
                  table_name='user_activity_daily')
    op.drop_table('user_activity_daily')
