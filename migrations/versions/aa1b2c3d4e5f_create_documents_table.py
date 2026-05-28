"""create_documents_table

Revision ID: aa1b2c3d4e5f
Revises: zz1a2b3c4d5e
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'aa1b2c3d4e5f'
down_revision = 'zz1a2b3c4d5e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'documents',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('doc_type', sa.String(64), nullable=True),
        sa.Column('issued_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=False),
        sa.Column('notify_days_before', sa.Integer(), nullable=True, server_default='30'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_documents_account_id', 'documents', ['account_id'])
    op.create_index('ix_documents_expiry_date', 'documents', ['account_id', 'expiry_date'])


def downgrade() -> None:
    op.drop_table('documents')
