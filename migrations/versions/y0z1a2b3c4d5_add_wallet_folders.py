"""add wallet_folders table and folder_id to wallet_balances

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-02-19 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'y0z1a2b3c4d5'
down_revision: str = 'x9y0z1a2b3c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create wallet_folders table
    op.create_table(
        'wallet_folders',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('wallet_type', sa.String(32), nullable=False),  # REGULAR, CREDIT, SAVINGS
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_wallet_folders_account_id', 'wallet_folders', ['account_id'])

    # Add folder_id to wallet_balances
    op.add_column('wallet_balances',
        sa.Column('folder_id', sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('wallet_balances', 'folder_id')
    op.drop_index('ix_wallet_folders_account_id', table_name='wallet_folders')
    op.drop_table('wallet_folders')
