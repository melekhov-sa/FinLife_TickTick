"""create goals tables

Revision ID: p1q2r3s4t5u6
Revises: d8ee990d0af4
Create Date: 2026-02-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'p1q2r3s4t5u6'
down_revision: Union[str, Sequence[str], None] = 'd8ee990d0af4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create goals and goal_wallet_balances tables."""
    op.create_table(
        'goals',
        sa.Column('goal_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('target_amount', sa.Numeric(precision=20, scale=2), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    op.create_table(
        'goal_wallet_balances',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('goal_id', sa.Integer(), nullable=False, index=True),
        sa.Column('wallet_id', sa.Integer(), nullable=False, index=True),
        sa.Column('amount', sa.Numeric(precision=20, scale=2), nullable=False,
                  server_default='0'),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.UniqueConstraint('goal_id', 'wallet_id', name='uq_goal_wallet'),
    )

    op.create_index('ix_goal_wallet_account', 'goal_wallet_balances',
                     ['account_id', 'goal_id'])


def downgrade() -> None:
    """Drop goals tables."""
    op.drop_index('ix_goal_wallet_account', table_name='goal_wallet_balances')
    op.drop_table('goal_wallet_balances')
    op.drop_table('goals')
