"""add fixed_time to task_reminders

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'x6y7z8a9b0c1'
down_revision = 'w5x6y7z8a9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('task_reminders', sa.Column('fixed_time', sa.Time(), nullable=True))
    op.alter_column('task_reminders', 'offset_minutes', server_default='0')
    op.drop_constraint('uq_task_reminder_offset', 'task_reminders', type_='unique')
    op.create_unique_constraint(
        'uq_task_reminder',
        'task_reminders',
        ['task_id', 'offset_minutes', 'reminder_kind', 'fixed_time'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_task_reminder', 'task_reminders', type_='unique')
    op.create_unique_constraint(
        'uq_task_reminder_offset',
        'task_reminders',
        ['task_id', 'offset_minutes', 'reminder_kind'],
    )
    op.drop_column('task_reminders', 'fixed_time')
