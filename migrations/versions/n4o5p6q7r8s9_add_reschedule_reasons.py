"""add reschedule reasons

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-02-21 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'n4o5p6q7r8s9'
down_revision: str = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. User setting
    op.add_column('users', sa.Column('enable_task_reschedule_reasons', sa.Boolean(),
                                     server_default='false', nullable=False))

    # 2. Reschedule reasons dictionary
    op.create_table(
        'task_reschedule_reasons',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
        sa.UniqueConstraint('user_id', 'name', name='uq_reschedule_reason_user_name'),
    )
    op.create_index('ix_reschedule_reasons_user_id', 'task_reschedule_reasons', ['user_id'])

    # 3. Due date change log
    op.create_table(
        'task_due_change_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.task_id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('old_due_date', sa.Date(), nullable=True),
        sa.Column('new_due_date', sa.Date(), nullable=False),
        sa.Column('reason_id', sa.Integer(),
                  sa.ForeignKey('task_reschedule_reasons.id', ondelete='SET NULL'),
                  nullable=True),
        sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index('ix_due_change_log_task_id', 'task_due_change_log', ['task_id'])
    op.create_index('ix_due_change_log_user_id', 'task_due_change_log', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_due_change_log_user_id', table_name='task_due_change_log')
    op.drop_index('ix_due_change_log_task_id', table_name='task_due_change_log')
    op.drop_table('task_due_change_log')
    op.drop_index('ix_reschedule_reasons_user_id', table_name='task_reschedule_reasons')
    op.drop_table('task_reschedule_reasons')
    op.drop_column('users', 'enable_task_reschedule_reasons')
