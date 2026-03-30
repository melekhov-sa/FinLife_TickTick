"""widen encrypted columns for Fernet ciphertext

Revision ID: t2u3v4w5x6y7
Revises: s1t2u3v4w5x6
Create Date: 2026-03-30
"""
from alembic import op
import sqlalchemy as sa

revision = "t2u3v4w5x6y7"
down_revision = "s1t2u3v4w5x6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fernet-encrypted values are ~2.5x longer than plaintext
    # bot_token: plaintext ~46 chars → encrypted ~160 chars
    # chat_id: plaintext ~10 chars → encrypted ~100 chars
    # p256dh: plaintext ~87 chars → encrypted ~230 chars
    # auth: plaintext ~22 chars → encrypted ~120 chars
    op.alter_column("telegram_settings", "bot_token", type_=sa.String(512))
    op.alter_column("telegram_settings", "chat_id", type_=sa.String(512))
    op.alter_column("push_subscriptions", "p256dh", type_=sa.String(512))
    op.alter_column("push_subscriptions", "auth", type_=sa.String(512))


def downgrade() -> None:
    op.alter_column("telegram_settings", "bot_token", type_=sa.String(128))
    op.alter_column("telegram_settings", "chat_id", type_=sa.String(64))
    op.alter_column("push_subscriptions", "p256dh", type_=sa.String(255))
    op.alter_column("push_subscriptions", "auth", type_=sa.String(255))
