"""Telegram long-polling: подтверждённое смещение getUpdates

Revision ID: c0d1e2f3a4b5
Revises: a8b9c0d1e2f3
"""
import sqlalchemy as sa
from alembic import op

revision = "c0d1e2f3a4b5"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "telegram_settings",
        sa.Column("poll_offset", sa.BigInteger(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("telegram_settings", "poll_offset")
