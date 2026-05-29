"""create_media_entries

Revision ID: ee5f6g7h8i9j
Revises: dd4e5f6g7h8i
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'ee5f6g7h8i9j'
down_revision = 'dd4e5f6g7h8i'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'media_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('media_type', sa.String(20), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('author', sa.Text(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='want'),
        sa.Column('rating', sa.SmallInteger(), nullable=True),
        sa.Column('cover_url', sa.Text(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('finished_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_media_entries_account_type', 'media_entries', ['account_id', 'media_type'])
    op.create_index('ix_media_entries_account_status', 'media_entries', ['account_id', 'status'])


def downgrade() -> None:
    op.drop_index('ix_media_entries_account_status', table_name='media_entries')
    op.drop_index('ix_media_entries_account_type', table_name='media_entries')
    op.drop_table('media_entries')
