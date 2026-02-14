"""add wallet_type to wallet_balances

Revision ID: 6c18942b5693
Revises: 0171dd4b38be
Create Date: 2026-02-13 22:20:21.265346

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c18942b5693'
down_revision: Union[str, Sequence[str], None] = '0171dd4b38be'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add wallet_type column to wallet_balances
    op.add_column('wallet_balances',
                  sa.Column('wallet_type', sa.String(length=32),
                           nullable=False, server_default='REGULAR'))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove wallet_type column
    op.drop_column('wallet_balances', 'wallet_type')
