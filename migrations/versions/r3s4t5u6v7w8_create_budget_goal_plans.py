"""create budget_goal_plans table

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-02-18 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'r3s4t5u6v7w8'
down_revision: str = 'q2r3s4t5u6v7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_goal_plans',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('budget_month_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.Column('plan_amount', sa.Numeric(precision=20, scale=2), server_default='0', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('budget_month_id', 'goal_id', name='uq_budget_goal_plan'),
    )
    op.create_index('ix_budget_goal_plan_month', 'budget_goal_plans', ['budget_month_id'])
    op.create_index('ix_budget_goal_plans_account_id', 'budget_goal_plans', ['account_id'])
    op.create_index('ix_budget_goal_plans_goal_id', 'budget_goal_plans', ['goal_id'])


def downgrade() -> None:
    op.drop_index('ix_budget_goal_plans_goal_id', table_name='budget_goal_plans')
    op.drop_index('ix_budget_goal_plans_account_id', table_name='budget_goal_plans')
    op.drop_index('ix_budget_goal_plan_month', table_name='budget_goal_plans')
    op.drop_table('budget_goal_plans')
