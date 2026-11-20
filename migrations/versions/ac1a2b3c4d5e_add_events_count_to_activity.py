"""add events_count to user_activity_daily

Выполнение события не считалось нигде: отметка не писала в журнал,
поэтому её не видели ни лента активности, ни XP, ни прогресс дня.
Теперь событие пишется в журнал, и для него нужен свой счётчик —
смешивать с задачами нельзя, подписи в графиках врали бы.

Revision ID: ac1a2b3c4d5e
Revises: sn1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "ac1a2b3c4d5e"
down_revision = "sn1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_activity_daily",
        sa.Column("events_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("user_activity_daily", "events_count")
