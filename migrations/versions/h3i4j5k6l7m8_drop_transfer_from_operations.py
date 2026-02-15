"""drop transfer fields from operation_templates

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-02-14 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h3i4j5k6l7m8'
down_revision: Union[str, Sequence[str], None] = 'g2h3i4j5k6l7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('operation_templates', 'from_wallet_id')
    op.drop_column('operation_templates', 'to_wallet_id')


def downgrade() -> None:
    op.add_column('operation_templates', sa.Column('from_wallet_id', sa.Integer(), nullable=True))
    op.add_column('operation_templates', sa.Column('to_wallet_id', sa.Integer(), nullable=True))
