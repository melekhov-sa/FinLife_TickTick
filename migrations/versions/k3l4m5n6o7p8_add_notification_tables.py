"""add notification_rules, notifications, notification_deliveries, user_notification_settings, telegram_settings, email_settings tables

Revision ID: k3l4m5n6o7p8
Revises: j2k3l4m5n6o7
Create Date: 2026-02-27

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "k3l4m5n6o7p8"
down_revision = "j2k3l4m5n6o7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # notification_rules — rule registry, seeded with 4 MVP rules
    op.create_table(
        "notification_rules",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(64), nullable=False, unique=True),
        sa.Column("title", sa.String(128), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("params_json", JSONB, nullable=False, server_default="{}"),
    )

    # Seed 4 MVP rules
    op.execute("""
        INSERT INTO notification_rules (code, title, description) VALUES
        ('SUB_MEMBER_EXPIRED',     'Подписка истекла',          'Участник подписки: срок истёк'),
        ('SUB_MEMBER_EXPIRES_SOON','Подписка истекает скоро',   'Участник подписки: осталось ≤3 дней'),
        ('PAYMENT_DUE_TOMORROW',   'Платёж завтра',              'Запланированный платёж на завтра'),
        ('TASK_OVERDUE',           'Просроченная задача',        'Активная задача с прошедшим сроком')
    """)

    # notifications — one record per distinct event occurrence (dedup by unique index)
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=False, index=True),
        sa.Column("rule_code", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(32), nullable=True),
        sa.Column("entity_id", sa.Integer, nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="info"),
        sa.Column("title", sa.String(256), nullable=False),
        sa.Column("body_inapp", sa.Text, nullable=False),
        sa.Column("body_telegram", sa.Text, nullable=False),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_notifications_user_unread",
        "notifications",
        ["user_id", "is_read"],
    )
    # Lookup index for dedup queries (user + rule + entity)
    op.create_index(
        "ix_notifications_dedup_lookup",
        "notifications",
        ["user_id", "rule_code", "entity_type", "entity_id"],
    )

    # notification_deliveries — per-channel delivery tracking
    op.create_table(
        "notification_deliveries",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("notification_id", sa.Integer,
                  sa.ForeignKey("notifications.id", ondelete="CASCADE"),
                  nullable=False),
        sa.Column("channel", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.UniqueConstraint("notification_id", "channel", name="uq_delivery_channel"),
    )

    # user_notification_settings — per-user preferences + quiet hours
    op.create_table(
        "user_notification_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=False, unique=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("quiet_start", sa.Time, nullable=True),
        sa.Column("quiet_end", sa.Time, nullable=True),
        sa.Column("channels_json", JSONB, nullable=False,
                  server_default='{"inapp":true,"telegram":false,"email":false}'),
    )

    # telegram_settings — user's Telegram chat_id for delivery
    op.create_table(
        "telegram_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=False, unique=True),
        sa.Column("chat_id", sa.String(64), nullable=True),
        sa.Column("connected", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("connected_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # email_settings — user's email override (stub for future SMTP)
    op.create_table(
        "email_settings",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=False, unique=True),
        sa.Column("email", sa.String(256), nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_table("email_settings")
    op.drop_table("telegram_settings")
    op.drop_table("user_notification_settings")
    op.drop_table("notification_deliveries")
    op.drop_table("notifications")
    op.drop_table("notification_rules")
