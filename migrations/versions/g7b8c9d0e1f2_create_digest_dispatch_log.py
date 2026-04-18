"""create digest_dispatch_log table

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'g7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "digest_dispatch_log",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, nullable=False, index=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("sent_date", sa.Date, nullable=False),
        sa.Column(
            "sent_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "kind", "sent_date", name="uq_digest_dispatch"),
    )


def downgrade() -> None:
    op.drop_table("digest_dispatch_log")
