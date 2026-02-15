"""merge budget and subscriptions branches

Revision ID: 087015a8ca1c
Revises: b2c3d4e5f6g7, i4j5k6l7m8n9
Create Date: 2026-02-15 14:15:59.298868

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '087015a8ca1c'
down_revision: Union[str, Sequence[str], None] = ('b2c3d4e5f6g7', 'i4j5k6l7m8n9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
