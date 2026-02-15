"""create subscriptions tables

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa


revision = 'i4j5k6l7m8n9'
down_revision = 'h3i4j5k6l7m8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('expense_category_id', sa.Integer(), nullable=False),
        sa.Column('income_category_id', sa.Integer(), nullable=False),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_subscriptions_account_id', 'subscriptions', ['account_id'])

    op.create_table(
        'subscription_members',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_subscription_members_subscription_id', 'subscription_members', ['subscription_id'])
    op.create_index('ix_subscription_members_account_id', 'subscription_members', ['account_id'])

    op.create_table(
        'subscription_coverages',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('payer_type', sa.String(16), nullable=False),
        sa.Column('member_id', sa.Integer(), nullable=True),
        sa.Column('transaction_id', sa.Integer(), nullable=False),
        sa.Column('start_month', sa.Date(), nullable=False),
        sa.Column('months_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_subscription_coverages_subscription_id', 'subscription_coverages', ['subscription_id'])
    op.create_index('ix_subscription_coverages_account_id', 'subscription_coverages', ['account_id'])
    op.create_unique_constraint('uq_coverage_transaction', 'subscription_coverages', ['transaction_id'])
    op.create_index('ix_coverage_sub_payer', 'subscription_coverages', ['subscription_id', 'payer_type', 'member_id'])


def downgrade():
    op.drop_table('subscription_coverages')
    op.drop_table('subscription_members')
    op.drop_table('subscriptions')
