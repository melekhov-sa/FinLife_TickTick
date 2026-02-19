"""add note column to budget_goal_plans and budget_goal_withdrawal_plans

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-02-19 12:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'x9y0z1a2b3c4'
down_revision: str = 'w8x9y0z1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('budget_goal_plans',
        sa.Column('note', sa.String(512), nullable=True)
    )
    op.add_column('budget_goal_withdrawal_plans',
        sa.Column('note', sa.String(512), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('budget_goal_withdrawal_plans', 'note')
    op.drop_column('budget_goal_plans', 'note')
