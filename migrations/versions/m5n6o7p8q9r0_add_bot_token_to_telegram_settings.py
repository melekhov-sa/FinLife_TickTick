"""Add bot_token column to telegram_settings table.

Revision ID: m5n6o7p8q9r0
Revises: l4m5n6o7p8q9
Create Date: 2026-02-27
"""
from alembic import op
import sqlalchemy as sa

revision = "m5n6o7p8q9r0"
down_revision = "l4m5n6o7p8q9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "telegram_settings",
        sa.Column("bot_token", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("telegram_settings", "bot_token")
