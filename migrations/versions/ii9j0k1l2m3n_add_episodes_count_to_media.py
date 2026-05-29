"""add_episodes_count_to_media

Revision ID: ii9j0k1l2m3n
Revises: hh8i9j0k1l2m
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'ii9j0k1l2m3n'
down_revision = 'hh8i9j0k1l2m'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('media_entries', sa.Column('episodes_count', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('media_entries', 'episodes_count')
