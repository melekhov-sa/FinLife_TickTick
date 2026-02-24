"""add board_columns to projects

Revision ID: d6e7f8g9h0i1
Revises: c5d6e7f8g9h0
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "d6e7f8g9h0i1"
down_revision = "c5d6e7f8g9h0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("board_columns", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("projects", "board_columns")
