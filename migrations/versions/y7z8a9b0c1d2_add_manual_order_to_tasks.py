"""add manual_order to tasks

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'y7z8a9b0c1d2'
down_revision = 'x6y7z8a9b0c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('manual_order', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'manual_order')
