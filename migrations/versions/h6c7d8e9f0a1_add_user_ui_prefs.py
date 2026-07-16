"""UI-настройки юзера (JSONB): видимость кошельков/чипов в быстром расходе и т.п.

Revision ID: h6c7d8e9f0a1
Revises: g5b6c7d8e9f0
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "h6c7d8e9f0a1"
down_revision = "g5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("ui_prefs", JSONB, nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("users", "ui_prefs")
