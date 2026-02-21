"""add task-expense link fields

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-02-21 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l2m3n4o5p6q7'
down_revision: str = 'k1l2m3n4o5p6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. User setting
    op.add_column('users', sa.Column('enable_task_expense_link', sa.Boolean(),
                                     server_default='false', nullable=False))

    # 2. Task expense fields
    op.add_column('tasks', sa.Column('requires_expense', sa.Boolean(),
                                     server_default='false', nullable=False))
    op.add_column('tasks', sa.Column('suggested_expense_category_id', sa.Integer(),
                                     nullable=True))
    op.add_column('tasks', sa.Column('suggested_amount', sa.Numeric(precision=20, scale=2),
                                     nullable=True))

    # 3. Transaction → task link
    op.add_column('transactions_feed', sa.Column('task_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions_feed', 'task_id')
    op.drop_column('tasks', 'suggested_amount')
    op.drop_column('tasks', 'suggested_expense_category_id')
    op.drop_column('tasks', 'requires_expense')
    op.drop_column('users', 'enable_task_expense_link')
