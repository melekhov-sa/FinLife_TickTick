"""Эмодзи финансовой категории (NULL = авто-подбор по названию на фронте)

Revision ID: g5b6c7d8e9f0
Revises: f4a5b6c7d8e9
"""
import sqlalchemy as sa
from alembic import op

revision = "g5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("emoji", sa.String(8), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "emoji")
