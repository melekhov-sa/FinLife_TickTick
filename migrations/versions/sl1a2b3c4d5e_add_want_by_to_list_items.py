"""add want_by and task_id to shared_list_items

Дата, к которой хочется купить позицию, и ссылка на автоматически
созданную в этот день задачу «Купить …».

task_id нужен сразу для двух вещей: не создавать задачу повторно каждый
день после наступления даты и связать выполнение задачи с отметкой
«куплено» в обе стороны.

Revision ID: sl1a2b3c4d5e
Revises: ca1b2c3d4e5f
"""
from alembic import op
import sqlalchemy as sa

revision = "sl1a2b3c4d5e"
down_revision = "ca1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shared_list_items", sa.Column("want_by", sa.Date(), nullable=True))
    op.add_column("shared_list_items", sa.Column("task_id", sa.Integer(), nullable=True))
    # Ежедневная выборка «что пора покупать» идёт ровно по этим двум полям.
    op.create_index(
        "ix_shared_list_items_want_by", "shared_list_items", ["want_by"]
    )
    op.create_index(
        "ix_shared_list_items_task_id", "shared_list_items", ["task_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_shared_list_items_task_id", table_name="shared_list_items")
    op.drop_index("ix_shared_list_items_want_by", table_name="shared_list_items")
    op.drop_column("shared_list_items", "task_id")
    op.drop_column("shared_list_items", "want_by")
