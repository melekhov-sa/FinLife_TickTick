"""add habit level

Revision ID: f1b2c3d4e5f6
Revises: e7a3b1c94f02
Create Date: 2026-02-14

"""
from alembic import op
import sqlalchemy as sa

revision = 'f1b2c3d4e5f6'
down_revision = 'e7a3b1c94f02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('habits', sa.Column('level', sa.SmallInteger(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('habits', 'level')
