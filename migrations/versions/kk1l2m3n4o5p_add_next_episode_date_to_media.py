"""add_next_episode_date_to_media

Revision ID: kk1l2m3n4o5p
Revises: jj0k1l2m3n4o
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'kk1l2m3n4o5p'
down_revision = 'jj0k1l2m3n4o'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('media_entries', sa.Column('next_episode_date', sa.Date(), nullable=True))
    op.add_column('media_entries', sa.Column('next_episode_label', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('media_entries', 'next_episode_label')
    op.drop_column('media_entries', 'next_episode_date')
