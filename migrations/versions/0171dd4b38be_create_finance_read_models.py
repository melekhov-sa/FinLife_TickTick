"""create finance read models

Revision ID: 0171dd4b38be
Revises: df327e2de836
Create Date: 2026-02-13 21:49:10.665321

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0171dd4b38be'
down_revision: Union[str, Sequence[str], None] = 'df327e2de836'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. projector_checkpoints
    op.create_table(
        'projector_checkpoints',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('projector_name', sa.String(length=128), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('last_event_id', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('projector_name', 'account_id', name='uq_projector_account')
    )
    op.create_index('ix_projector_checkpoints_projector_name', 'projector_checkpoints', ['projector_name'])
    op.create_index('ix_projector_checkpoints_account_id', 'projector_checkpoints', ['account_id'])

    # 2. wallet_balances
    op.create_table(
        'wallet_balances',
        sa.Column('wallet_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('balance', sa.Numeric(precision=20, scale=2), nullable=False, server_default='0'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('wallet_id')
    )
    op.create_index('ix_wallet_balances_account_id', 'wallet_balances', ['account_id'])

    # 3. categories
    op.create_table(
        'categories',
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('category_type', sa.String(length=20), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('category_id')
    )
    op.create_index('ix_categories_account_id', 'categories', ['account_id'])
    op.create_index('ix_categories_parent_id', 'categories', ['parent_id'])

    # 4. transactions_feed
    op.create_table(
        'transactions_feed',
        sa.Column('transaction_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('operation_type', sa.String(length=20), nullable=False),
        sa.Column('amount', sa.Numeric(precision=20, scale=2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('wallet_id', sa.Integer(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('from_wallet_id', sa.Integer(), nullable=True),
        sa.Column('to_wallet_id', sa.Integer(), nullable=True),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('transaction_id')
    )
    op.create_index('ix_transactions_feed_account_id', 'transactions_feed', ['account_id'])
    op.create_index('ix_transactions_feed_operation_type', 'transactions_feed', ['operation_type'])
    op.create_index('ix_transactions_feed_wallet_id', 'transactions_feed', ['wallet_id'])
    op.create_index('ix_transactions_feed_category_id', 'transactions_feed', ['category_id'])
    op.create_index('ix_transactions_feed_occurred_at', 'transactions_feed', ['occurred_at'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('transactions_feed')
    op.drop_table('categories')
    op.drop_table('wallet_balances')
    op.drop_table('projector_checkpoints')
