"""create budget_variant_hidden_goals table

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-02-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'v7w8x9y0z1a2'
down_revision: str = 'u6v7w8x9y0z1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_variant_hidden_goals',
        sa.Column('variant_id', sa.Integer(), nullable=False),
        sa.Column('goal_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('variant_id', 'goal_id'),
    )
    op.create_index(
        'ix_bvhg_variant',
        'budget_variant_hidden_goals',
        ['variant_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_bvhg_variant', table_name='budget_variant_hidden_goals')
    op.drop_table('budget_variant_hidden_goals')
