"""add_digests_table

Revision ID: z9a0b1c2d3e4
Revises: z1a2b3c4d5e6
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'z9a0b1c2d3e4'
down_revision = 'z1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'digests',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_type', sa.String(16), nullable=False),
        sa.Column('period_key', sa.String(16), nullable=False),
        sa.Column('generated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('ai_comment', sa.Text(), nullable=True),
        sa.Column('viewed_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        'uq_digest_account_period',
        'digests',
        ['account_id', 'period_type', 'period_key'],
    )
    op.create_index(
        'ix_digest_account_type_generated',
        'digests',
        ['account_id', 'period_type', 'generated_at'],
    )


def downgrade() -> None:
    op.drop_index('ix_digest_account_type_generated', table_name='digests')
    op.drop_constraint('uq_digest_account_period', 'digests', type_='unique')
    op.drop_table('digests')
