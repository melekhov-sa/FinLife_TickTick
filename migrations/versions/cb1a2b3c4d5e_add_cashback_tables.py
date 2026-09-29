"""add cashback tables

Revision ID: cb1a2b3c4d5e
Revises: l0a1b2c3d4e5
Create Date: 2026-09-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'cb1a2b3c4d5e'
down_revision: Union[str, Sequence[str], None] = 'l0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'cashback_categories',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'title', name='uq_cashback_category_account_title'),
    )
    op.create_index('ix_cashback_categories_account_id', 'cashback_categories', ['account_id'])

    op.create_table(
        'cashback_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('wallet_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('percent', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('period_month', sa.Date(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['cashback_categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'account_id', 'wallet_id', 'category_id', 'period_month',
            name='uq_cashback_entry_card_category_month',
        ),
    )
    op.create_index('ix_cashback_entries_account_id', 'cashback_entries', ['account_id'])
    op.create_index('ix_cashback_entries_account_month', 'cashback_entries', ['account_id', 'period_month'])


def downgrade() -> None:
    op.drop_index('ix_cashback_entries_account_month', table_name='cashback_entries')
    op.drop_index('ix_cashback_entries_account_id', table_name='cashback_entries')
    op.drop_table('cashback_entries')
    op.drop_index('ix_cashback_categories_account_id', table_name='cashback_categories')
    op.drop_table('cashback_categories')
