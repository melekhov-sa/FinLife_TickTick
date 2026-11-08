"""add backup status

Revision ID: bs1a2b3c4d5e
Revises: wt1a2b3c4d5e
Create Date: 2026-11-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'bs1a2b3c4d5e'
down_revision: Union[str, Sequence[str], None] = 'wt1a2b3c4d5e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'backup_status',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('last_run_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('size_text', sa.String(length=32), nullable=True),
        sa.Column('offsite_ok', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('config_ok', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('backup_status')
