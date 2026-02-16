"""create wishes table

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-02-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import TIMESTAMP


revision = 'o0p1q2r3s4t5'
down_revision = 'n9o0p1q2r3s4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'wishes',
        sa.Column('wish_id', sa.Integer, primary_key=True),
        sa.Column('account_id', sa.Integer, nullable=False, index=True),

        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('wish_type', sa.String(20), nullable=False, index=True),
        sa.Column('status', sa.String(20), nullable=False, index=True),

        sa.Column('target_date', sa.Date, nullable=True, index=True),
        sa.Column('target_month', sa.String(7), nullable=True, index=True),

        sa.Column('estimated_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('is_recurring', sa.Boolean, nullable=False, server_default='false', index=True),
        sa.Column('last_completed_at', TIMESTAMP(timezone=True), nullable=True),

        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('created_at', TIMESTAMP(timezone=True), nullable=False),
        sa.Column('updated_at', TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('wishes')
