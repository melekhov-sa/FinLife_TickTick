"""add ai_digest_enabled to users

Revision ID: c3d4e5f6a7b8
Revises: a0b1c2d3e4f5
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa


revision = 'c3d4e5f6a7b8'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ai_digest_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "ai_digest_enabled")
