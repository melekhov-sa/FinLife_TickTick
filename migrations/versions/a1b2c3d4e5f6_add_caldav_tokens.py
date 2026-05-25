"""add_caldav_tokens

Revision ID: a1b2c3d4e5f6
Revises: z9a0b1c2d3e4
Create Date: 2026-05-25

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'z9a0b1c2d3e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'caldav_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_caldav_tokens_account_id', 'caldav_tokens', ['account_id'])
    op.create_index('ix_caldav_tokens_token', 'caldav_tokens', ['token'])


def downgrade() -> None:
    op.drop_table('caldav_tokens')
