"""add anchor to recurrence_rules

Режим «следующая задача через N после выполнения предыдущей».

anchor=SCHEDULE  — как было всегда: даты берутся из календаря.
anchor=COMPLETION — цепочка: вхождения вперёд не генерируются, следующее
создаётся в момент закрытия текущего, дата = дата выполнения + interval
единиц freq. freq при этом означает единицу (день/неделя/месяц/год).

server_default='SCHEDULE' — все существующие правила остаются как есть.

Revision ID: ca1b2c3d4e5f
Revises: rd1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "ca1b2c3d4e5f"
down_revision = "rd1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recurrence_rules",
        sa.Column("anchor", sa.String(length=16), nullable=False, server_default="SCHEDULE"),
    )


def downgrade() -> None:
    op.drop_column("recurrence_rules", "anchor")
