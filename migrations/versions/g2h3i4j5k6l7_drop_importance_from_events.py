"""drop importance from events

Revision ID: g2h3i4j5k6l7
Revises: f1b2c3d4e5f6
Create Date: 2026-02-14 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g2h3i4j5k6l7'
down_revision: Union[str, Sequence[str], None] = 'f1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('events', 'importance')


def downgrade() -> None:
    op.add_column('events', sa.Column('importance', sa.Integer(), nullable=False, server_default='0'))
