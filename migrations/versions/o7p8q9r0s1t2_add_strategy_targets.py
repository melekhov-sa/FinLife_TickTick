"""add strategy_targets table

Revision ID: o7p8q9r0s1t2
Revises: n6o7p8q9r0s1
Create Date: 2026-03-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'o7p8q9r0s1t2'
down_revision = 'n6o7p8q9r0s1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'strategy_targets',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer, nullable=False, index=True),
        sa.Column('metric_type', sa.String(32), nullable=False),
        sa.Column('title', sa.String(128), nullable=False),
        sa.Column('target_value', sa.Float, nullable=False),
        sa.Column('baseline_value', sa.Float, nullable=True),
        sa.Column('category_id', sa.Integer, nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('strategy_targets')
