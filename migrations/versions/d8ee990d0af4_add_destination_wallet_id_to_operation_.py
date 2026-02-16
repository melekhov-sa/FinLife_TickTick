"""add destination_wallet_id to operation_templates

Revision ID: d8ee990d0af4
Revises: o0p1q2r3s4t5
Create Date: 2026-02-16 21:47:14.969730

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8ee990d0af4'
down_revision: Union[str, Sequence[str], None] = 'o0p1q2r3s4t5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'operation_templates',
        sa.Column('destination_wallet_id', sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('operation_templates', 'destination_wallet_id')
