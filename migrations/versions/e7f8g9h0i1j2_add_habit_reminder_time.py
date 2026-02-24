"""Add reminder_time to habits

Revision ID: e7f8g9h0i1j2
Revises: d6e7f8g9h0i1
"""
from alembic import op
import sqlalchemy as sa

revision = "e7f8g9h0i1j2"
down_revision = "d6e7f8g9h0i1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("habits", sa.Column("reminder_time", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("habits", "reminder_time")
