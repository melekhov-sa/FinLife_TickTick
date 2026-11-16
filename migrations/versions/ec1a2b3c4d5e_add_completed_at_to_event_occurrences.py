"""add completed_at to event_occurrences

Отметка выполнения события меняла только булев флаг: ни времени, ни записи
в журнал. Ответить «когда я это закрыл» было нельзя — updated_at у таблицы
объявлен без onupdate и остаётся временем создания.

Revision ID: ec1a2b3c4d5e
Revises: sl1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "ec1a2b3c4d5e"
down_revision = "sl1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "event_occurrences",
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("event_occurrences", "completed_at")
