"""add is_system and sort_order to categories

Revision ID: 86463ec067ba
Revises: 6c18942b5693
Create Date: 2026-02-13 22:49:13.275928

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '86463ec067ba'
down_revision: Union[str, Sequence[str], None] = '6c18942b5693'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add is_system and sort_order columns to categories
    op.add_column('categories',
                  sa.Column('is_system', sa.Boolean(),
                           nullable=False, server_default='false'))
    op.add_column('categories',
                  sa.Column('sort_order', sa.Integer(),
                           nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove is_system and sort_order columns
    op.drop_column('categories', 'sort_order')
    op.drop_column('categories', 'is_system')
