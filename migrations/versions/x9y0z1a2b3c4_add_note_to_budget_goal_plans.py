"""create budget_goal_withdrawal_plans and add note to budget_goal_plans

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-02-19 12:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'x9y0z1a2b3c4'
down_revision: str = 'w8x9y0z1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create budget_goal_withdrawal_plans (was missing from all previous migrations)
    op.create_table(
        'budget_goal_withdrawal_plans',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('budget_month_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('plan_amount', sa.Numeric(precision=20, scale=2), server_default='0', nullable=False),
        sa.Column('note', sa.String(512), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('budget_month_id', 'goal_id', name='uq_budget_goal_withdrawal_plan'),
    )
    op.create_index('ix_bgwp_month', 'budget_goal_withdrawal_plans', ['budget_month_id'])
    op.create_index('ix_bgwp_account_id', 'budget_goal_withdrawal_plans', ['account_id'])
    op.create_index('ix_bgwp_goal_id', 'budget_goal_withdrawal_plans', ['goal_id'])

    # Add note column to budget_goal_plans
    op.add_column('budget_goal_plans',
        sa.Column('note', sa.String(512), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('budget_goal_plans', 'note')
    op.drop_index('ix_bgwp_goal_id', table_name='budget_goal_withdrawal_plans')
    op.drop_index('ix_bgwp_account_id', table_name='budget_goal_withdrawal_plans')
    op.drop_index('ix_bgwp_month', table_name='budget_goal_withdrawal_plans')
    op.drop_table('budget_goal_withdrawal_plans')
