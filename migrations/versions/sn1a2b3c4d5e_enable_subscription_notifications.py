"""enable subscription notifications by default

Уведомления об окончании подписок не приходили ни разу: notify_enabled
нигде не выставлялся и оставался false, а notify_days_before — NULL,
из-за чего ежедневное задание отсекало вообще все подписки.

Включаем по умолчанию и напоминаем в день окончания (0 дней до).
Окно догона в коде добирает пропущенное, если планировщик не отработал.

Revision ID: sn1a2b3c4d5e
Revises: ec1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "sn1a2b3c4d5e"
down_revision = "ec1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE subscriptions SET notify_enabled = true "
        "WHERE notify_enabled = false"
    )
    op.execute(
        "UPDATE subscriptions SET notify_days_before = 0 "
        "WHERE notify_days_before IS NULL"
    )
    op.alter_column("subscriptions", "notify_enabled", server_default="true")
    op.alter_column("subscriptions", "notify_days_before", server_default="0")


def downgrade() -> None:
    op.alter_column("subscriptions", "notify_enabled", server_default="false")
    op.alter_column("subscriptions", "notify_days_before", server_default=None)
