"""Per-kind notification prefs + telegram webhook secret

rule_prefs_json: {kind: {"enabled": bool, "silent": bool}} — управление
каждым видом уведомлений отдельно (вкл/выкл, без звука).
webhook_secret: секрет в URL вебхука бота для команд (/budget, /today).

Revision ID: a8b9c0d1e2f3
Revises: w9x0y1z2a3b4
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "a8b9c0d1e2f3"
down_revision = "w9x0y1z2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_notification_settings",
        sa.Column("rule_prefs_json", JSONB, nullable=False, server_default="{}"),
    )
    op.add_column(
        "telegram_settings",
        sa.Column("webhook_secret", sa.String(64), nullable=True),
    )
    op.create_index(
        "ix_telegram_settings_webhook_secret",
        "telegram_settings",
        ["webhook_secret"],
    )


def downgrade() -> None:
    op.drop_index("ix_telegram_settings_webhook_secret", table_name="telegram_settings")
    op.drop_column("telegram_settings", "webhook_secret")
    op.drop_column("user_notification_settings", "rule_prefs_json")
