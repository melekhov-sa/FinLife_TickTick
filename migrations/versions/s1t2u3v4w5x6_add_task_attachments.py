"""add task_attachments table (merge all heads)

Revision ID: s1t2u3v4w5x6
Revises: f1b2c3d4e5f6, i4j5k6l7m8n9, o0p1q2r3s4t5, r0s1t2u3v4w5
Create Date: 2026-03-25
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str]] = (
    "f1b2c3d4e5f6",  # add_habit_level
    "i4j5k6l7m8n9",  # create_subscriptions_tables
    "o0p1q2r3s4t5",  # create_wishes_table
    "r0s1t2u3v4w5",  # add_hide_from_plan_to_projects
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.task_id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_filename", sa.String(512), nullable=False),
        sa.Column("mime_type", sa.String(128), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_task_attachments_task", "task_attachments", ["account_id", "task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_attachments_task", table_name="task_attachments")
    op.drop_table("task_attachments")
