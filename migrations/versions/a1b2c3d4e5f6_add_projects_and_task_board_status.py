"""add projects and task board_status

Revision ID: a1b2c3d4e5f6
Revises: z1a2b3c4d5e6
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- Create projects table --
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), server_default="planned", nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_account_id", "projects", ["account_id"])
    op.create_index("ix_projects_status", "projects", ["status"])

    # -- Add project_id and board_status to tasks --
    op.add_column(
        "tasks",
        sa.Column(
            "project_id",
            sa.Integer(),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "tasks",
        sa.Column(
            "board_status",
            sa.String(20),
            server_default="backlog",
            nullable=False,
        ),
    )
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_project_board", "tasks", ["project_id", "board_status"])


def downgrade() -> None:
    op.drop_index("ix_tasks_project_board", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_column("tasks", "board_status")
    op.drop_column("tasks", "project_id")

    op.drop_index("ix_projects_status", table_name="projects")
    op.drop_index("ix_projects_account_id", table_name="projects")
    op.drop_table("projects")
