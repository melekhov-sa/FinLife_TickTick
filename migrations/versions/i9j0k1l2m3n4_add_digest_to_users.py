"""add digest columns to users

Revision ID: i9j0k1l2m3n4
Revises: h9i0j1k2l3m4
Create Date: 2026-02-20 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i9j0k1l2m3n4'
down_revision: str = 'h9i0j1k2l3m4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('digest_morning', sa.Boolean(), server_default='true', nullable=True))
    op.add_column('users', sa.Column('digest_evening', sa.Boolean(), server_default='true', nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'digest_evening')
    op.drop_column('users', 'digest_morning')
