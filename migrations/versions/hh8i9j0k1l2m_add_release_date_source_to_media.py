"""add_release_date_source_to_media

Revision ID: hh8i9j0k1l2m
Revises: gg7h8i9j0k1l
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'hh8i9j0k1l2m'
down_revision = 'gg7h8i9j0k1l'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('media_entries', sa.Column('release_date_source', sa.String(10), nullable=True))


def downgrade():
    op.drop_column('media_entries', 'release_date_source')
