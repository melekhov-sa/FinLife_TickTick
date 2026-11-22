"""add title to goal_saving_plans

Планов на одну цель бывает несколько, и в бюджете они складываются в
одно число. Без названия разбивка нечитаема: видно «2 666,67», но не
видно, что это «на др брата» плюс «на др Пете».

Revision ID: gt1a2b3c4d5e
Revises: gs1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "gt1a2b3c4d5e"
down_revision = "gs1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goal_saving_plans",
        sa.Column("title", sa.String(length=120), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("goal_saving_plans", "title")
