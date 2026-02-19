"""create budget_variant_hidden_categories table

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-02-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'u6v7w8x9y0z1'
down_revision: str = 't5u6v7w8x9y0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_variant_hidden_categories',
        sa.Column('variant_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('variant_id', 'category_id'),
    )
    op.create_index(
        'ix_bvhc_variant',
        'budget_variant_hidden_categories',
        ['variant_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_bvhc_variant', table_name='budget_variant_hidden_categories')
    op.drop_table('budget_variant_hidden_categories')
