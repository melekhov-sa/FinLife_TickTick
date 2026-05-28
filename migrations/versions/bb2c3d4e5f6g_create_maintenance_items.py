"""create_maintenance_items

Revision ID: bb2c3d4e5f6g
Revises: aa1b2c3d4e5f
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'bb2c3d4e5f6g'
down_revision = 'aa1b2c3d4e5f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'maintenance_items',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('interval_days', sa.Integer(), nullable=False),
        sa.Column('last_done_date', sa.Date(), nullable=True),
        sa.Column('last_done_note', sa.Text(), nullable=True),
        sa.Column('notify_days_before', sa.Integer(), nullable=True, server_default='3'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_maintenance_items_account_id', 'maintenance_items', ['account_id'])


def downgrade() -> None:
    op.drop_table('maintenance_items')
