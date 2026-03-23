"""make password_hash nullable (Supabase auth)

Revision ID: q9r0s1t2u3v4
Revises: p8q9r0s1t2u3
Create Date: 2026-03-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'q9r0s1t2u3v4'
down_revision = 'p8q9r0s1t2u3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('users', 'password_hash', nullable=True)


def downgrade() -> None:
    # Fill nulls before restoring NOT NULL
    op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")
    op.alter_column('users', 'password_hash', nullable=False)
