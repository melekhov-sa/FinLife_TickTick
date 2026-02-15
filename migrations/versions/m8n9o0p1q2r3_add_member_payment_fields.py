"""add payment_per_year and payment_per_month to subscription_members

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa


revision = 'm8n9o0p1q2r3'
down_revision = 'l7m8n9o0p1q2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('subscription_members',
        sa.Column('payment_per_year', sa.Numeric(12, 2), nullable=True))
    op.add_column('subscription_members',
        sa.Column('payment_per_month', sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column('subscription_members', 'payment_per_month')
    op.drop_column('subscription_members', 'payment_per_year')
