"""add dynamics fields to wallet_balances

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-02-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TIMESTAMP


revision = 'n9o0p1q2r3s4'
down_revision = 'm8n9o0p1q2r3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('wallet_balances',
        sa.Column('balance_30d_ago', sa.Numeric(20, 2), nullable=True))
    op.add_column('wallet_balances',
        sa.Column('operations_count_30d', sa.Integer, nullable=False, server_default='0'))
    op.add_column('wallet_balances',
        sa.Column('last_operation_at', TIMESTAMP(timezone=True), nullable=True))


def downgrade():
    op.drop_column('wallet_balances', 'last_operation_at')
    op.drop_column('wallet_balances', 'operations_count_30d')
    op.drop_column('wallet_balances', 'balance_30d_ago')
