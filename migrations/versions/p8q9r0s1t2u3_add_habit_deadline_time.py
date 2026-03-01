"""add deadline_time to habits

Revision ID: p8q9r0s1t2u3
Revises: o7p8q9r0s1t2
Create Date: 2026-03-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'p8q9r0s1t2u3'
down_revision = 'o7p8q9r0s1t2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('habits', sa.Column('deadline_time', sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column('habits', 'deadline_time')
