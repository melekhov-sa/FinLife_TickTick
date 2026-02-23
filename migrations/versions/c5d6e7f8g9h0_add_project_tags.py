"""add project tags

Revision ID: c5d6e7f8g9h0
Revises: b4c5d6e7f8g9
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "c5d6e7f8g9h0"
down_revision = "b4c5d6e7f8g9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- project_tags --
    op.create_table(
        "project_tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "project_id", sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "name", name="uq_project_tag_name"),
    )
    op.create_index("ix_project_tags_project_id", "project_tags", ["project_id"])

    # -- task_project_tags --
    op.create_table(
        "task_project_tags",
        sa.Column(
            "task_id", sa.Integer(),
            sa.ForeignKey("tasks.task_id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "project_tag_id", sa.Integer(),
            sa.ForeignKey("project_tags.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("task_id", "project_tag_id"),
    )
    op.create_index("ix_task_project_tags_task_id", "task_project_tags", ["task_id"])
    op.create_index("ix_task_project_tags_tag_id", "task_project_tags", ["project_tag_id"])


def downgrade() -> None:
    op.drop_index("ix_task_project_tags_tag_id", table_name="task_project_tags")
    op.drop_index("ix_task_project_tags_task_id", table_name="task_project_tags")
    op.drop_table("task_project_tags")
    op.drop_index("ix_project_tags_project_id", table_name="project_tags")
    op.drop_table("project_tags")
