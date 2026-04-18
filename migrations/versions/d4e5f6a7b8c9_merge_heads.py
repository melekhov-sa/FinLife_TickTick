"""merge heads: manual_order + ai_digest_enabled

Revision ID: d4e5f6a7b8c9
Revises: y7z8a9b0c1d2, c3d4e5f6a7b8
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = ('y7z8a9b0c1d2', 'c3d4e5f6a7b8')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
