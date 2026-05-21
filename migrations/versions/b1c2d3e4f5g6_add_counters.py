"""add counters tables

Revision ID: b1c2d3e4f5g6
Revises: z9a0b1c2d3e4
Create Date: 2026-05-21

"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5g6'
down_revision = ('z9a0b1c2d3e4', 'j6k7l8m9n0o1')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'counters',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('account_id', sa.Integer, nullable=False, index=True),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('emoji', sa.String(16), nullable=True),
        sa.Column('mode', sa.String(32), nullable=False, server_default='manual'),
        sa.Column('source_category_id', sa.Integer, nullable=True),
        sa.Column('period_type', sa.String(16), nullable=False, server_default='year'),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('is_archived', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        'counter_entries',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('counter_id', sa.Integer, sa.ForeignKey('counters.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('account_id', sa.Integer, nullable=False, index=True),
        sa.Column('recorded_date', sa.Date, nullable=False),
        sa.Column('delta', sa.Integer, nullable=False, server_default='1'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table('counter_entries')
    op.drop_table('counters')
