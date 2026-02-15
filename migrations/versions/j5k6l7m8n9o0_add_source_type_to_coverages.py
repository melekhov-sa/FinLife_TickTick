"""add source_type to subscription_coverages and make transaction_id nullable

Revision ID: j5k6l7m8n9o0
Revises: 087015a8ca1c
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa


revision = 'j5k6l7m8n9o0'
down_revision = '087015a8ca1c'
branch_labels = None
depends_on = None


def upgrade():
    # Add source_type column with default OPERATION
    op.add_column(
        'subscription_coverages',
        sa.Column('source_type', sa.String(16), nullable=False, server_default='OPERATION'),
    )
    # Make transaction_id nullable (INITIAL coverages have no transaction)
    op.alter_column(
        'subscription_coverages',
        'transaction_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade():
    # Make transaction_id NOT NULL again (only safe if no INITIAL coverages exist)
    op.alter_column(
        'subscription_coverages',
        'transaction_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column('subscription_coverages', 'source_type')
