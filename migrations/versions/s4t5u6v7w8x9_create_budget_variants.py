"""create budget_variants table and link budget_months

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-02-18 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 's4t5u6v7w8x9'
down_revision: str = 'r3s4t5u6v7w8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create budget_variants table
    op.create_table(
        'budget_variants',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('base_granularity', sa.String(16), server_default='MONTH', nullable=False),
        sa.Column('week_starts_on', sa.Integer(), server_default='1', nullable=False),
        sa.Column('timezone', sa.String(64), server_default="'Europe/Moscow'", nullable=False),
        sa.Column('is_archived', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_budget_variants_account_id', 'budget_variants', ['account_id'])
    op.create_index('ix_budget_variant_account_archived', 'budget_variants', ['account_id', 'is_archived'])

    # 2. Add budget_variant_id column to budget_months (nullable — orphan data until user attaches)
    op.add_column('budget_months', sa.Column('budget_variant_id', sa.Integer(), nullable=True))
    op.create_index('ix_budget_months_variant_id', 'budget_months', ['budget_variant_id'])

    # No seed data — user creates variants manually via UI


def downgrade() -> None:
    op.drop_index('ix_budget_months_variant_id', table_name='budget_months')
    op.drop_column('budget_months', 'budget_variant_id')
    op.drop_index('ix_budget_variant_account_archived', table_name='budget_variants')
    op.drop_index('ix_budget_variants_account_id', table_name='budget_variants')
    op.drop_table('budget_variants')
