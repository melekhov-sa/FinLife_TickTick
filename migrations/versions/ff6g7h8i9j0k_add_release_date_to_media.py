"""add_release_date_to_media

Revision ID: ff6g7h8i9j0k
Revises: ee5f6g7h8i9j
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'ff6g7h8i9j0k'
down_revision = 'ee5f6g7h8i9j'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('media_entries', sa.Column('release_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('media_entries', 'release_date')
