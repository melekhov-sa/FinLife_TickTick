"""add goal_ids to transactions_feed

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-02-18 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'q2r3s4t5u6v7'
down_revision: Union[str, Sequence[str], None] = 'p1q2r3s4t5u6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add from_goal_id and to_goal_id to transactions_feed."""
    op.add_column(
        'transactions_feed',
        sa.Column('from_goal_id', sa.Integer(), nullable=True)
    )
    op.add_column(
        'transactions_feed',
        sa.Column('to_goal_id', sa.Integer(), nullable=True)
    )
    op.create_index('ix_transactions_feed_from_goal_id', 'transactions_feed', ['from_goal_id'])
    op.create_index('ix_transactions_feed_to_goal_id', 'transactions_feed', ['to_goal_id'])


def downgrade() -> None:
    """Remove goal_id columns from transactions_feed."""
    op.drop_index('ix_transactions_feed_to_goal_id', table_name='transactions_feed')
    op.drop_index('ix_transactions_feed_from_goal_id', table_name='transactions_feed')
    op.drop_column('transactions_feed', 'to_goal_id')
    op.drop_column('transactions_feed', 'from_goal_id')
