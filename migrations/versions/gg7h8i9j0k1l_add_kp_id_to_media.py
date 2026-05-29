"""add_kp_id_to_media

Revision ID: gg7h8i9j0k1l
Revises: ff6g7h8i9j0k
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'gg7h8i9j0k1l'
down_revision = 'ff6g7h8i9j0k'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('media_entries', sa.Column('kp_id', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('media_entries', 'kp_id')
