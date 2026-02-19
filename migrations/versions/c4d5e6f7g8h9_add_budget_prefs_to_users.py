"""add budget_grain and budget_range_count to users

Revision ID: c4d5e6f7g8h9
Revises: b3c4d5e6f7g8
Create Date: 2026-02-19 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7g8h9'
down_revision: str = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('budget_grain', sa.String(10), nullable=True, server_default=None),
    )
    op.add_column(
        'users',
        sa.Column('budget_range_count', sa.Integer(), nullable=True, server_default=None),
    )


def downgrade() -> None:
    op.drop_column('users', 'budget_range_count')
    op.drop_column('users', 'budget_grain')
