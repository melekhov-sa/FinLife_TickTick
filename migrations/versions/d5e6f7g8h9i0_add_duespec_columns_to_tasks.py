"""add due_kind, due_time, due_start_time, due_end_time to tasks

Revision ID: d5e6f7g8h9i0
Revises: c4d5e6f7g8h9
Create Date: 2026-02-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7g8h9i0'
down_revision: str = 'c4d5e6f7g8h9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'tasks',
        sa.Column('due_kind', sa.String(16), nullable=False, server_default='NONE'),
    )
    op.add_column('tasks', sa.Column('due_time', sa.Time(), nullable=True))
    op.add_column('tasks', sa.Column('due_start_time', sa.Time(), nullable=True))
    op.add_column('tasks', sa.Column('due_end_time', sa.Time(), nullable=True))

    # Fix existing tasks: if due_date is set, mark as DATE
    op.execute("UPDATE tasks SET due_kind = 'DATE' WHERE due_date IS NOT NULL AND due_kind = 'NONE'")


def downgrade() -> None:
    op.drop_column('tasks', 'due_end_time')
    op.drop_column('tasks', 'due_start_time')
    op.drop_column('tasks', 'due_time')
    op.drop_column('tasks', 'due_kind')
