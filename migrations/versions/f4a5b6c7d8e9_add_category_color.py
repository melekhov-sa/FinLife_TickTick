"""Цвет финансовой категории (#RRGGBB, NULL = авто из палитры)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""
import sqlalchemy as sa
from alembic import op

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("color", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "color")
