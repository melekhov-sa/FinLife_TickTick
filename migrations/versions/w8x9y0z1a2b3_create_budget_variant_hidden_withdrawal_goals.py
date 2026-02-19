"""create budget_variant_hidden_withdrawal_goals table

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-02-19 12:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'w8x9y0z1a2b3'
down_revision: str = 'v7w8x9y0z1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_variant_hidden_withdrawal_goals',
        sa.Column('variant_id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('variant_id', 'goal_id'),
    )
    op.create_index(
        'ix_bvhwg_variant',
        'budget_variant_hidden_withdrawal_goals',
        ['variant_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_bvhwg_variant', table_name='budget_variant_hidden_withdrawal_goals')
    op.drop_table('budget_variant_hidden_withdrawal_goals')
