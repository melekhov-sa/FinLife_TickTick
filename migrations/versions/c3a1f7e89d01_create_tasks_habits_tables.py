"""create tasks habits tables

Revision ID: c3a1f7e89d01
Revises: 86463ec067ba
Create Date: 2026-02-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3a1f7e89d01'
down_revision: Union[str, Sequence[str], None] = '86463ec067ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create 9 tables for tasks, habits, planned operations."""

    # 1. work_categories
    op.create_table(
        'work_categories',
        sa.Column('category_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('emoji', sa.String(16), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('account_id', 'title', name='uq_work_category_account_title'),
    )

    # 2. recurrence_rules
    op.create_table(
        'recurrence_rules',
        sa.Column('rule_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('freq', sa.String(32), nullable=False),
        sa.Column('interval', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('until_date', sa.Date(), nullable=True),
        sa.Column('count', sa.Integer(), nullable=True),
        sa.Column('by_weekday', sa.String(64), nullable=True),
        sa.Column('by_monthday', sa.Integer(), nullable=True),
        sa.Column('monthday_clip_to_last_day', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('by_month', sa.Integer(), nullable=True),
        sa.Column('by_monthday_for_year', sa.Integer(), nullable=True),
        sa.Column('dates_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 3. tasks (one-off)
    op.create_table(
        'tasks',
        sa.Column('task_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(32), nullable=False, server_default='ACTIVE'),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('archived_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # 4. habits
    op.create_table(
        'habits',
        sa.Column('habit_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('active_from', sa.Date(), nullable=False),
        sa.Column('active_until', sa.Date(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('best_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('done_count_30d', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 5. habit_occurrences
    op.create_table(
        'habit_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('habit_id', sa.Integer(), nullable=False, index=True),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='ACTIVE'),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint('account_id', 'habit_id', 'scheduled_date', name='uq_habit_occurrence'),
    )
    op.create_index('ix_habit_occ_date', 'habit_occurrences', ['account_id', 'habit_id', 'scheduled_date'])

    # 6. task_templates
    op.create_table(
        'task_templates',
        sa.Column('template_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('active_from', sa.Date(), nullable=False),
        sa.Column('active_until', sa.Date(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 7. task_occurrences
    op.create_table(
        'task_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('template_id', sa.Integer(), nullable=False, index=True),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='ACTIVE'),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.UniqueConstraint('account_id', 'template_id', 'scheduled_date', name='uq_task_occurrence'),
    )
    op.create_index('ix_task_occ_date', 'task_occurrences', ['account_id', 'template_id', 'scheduled_date'])

    # 8. operation_templates
    op.create_table(
        'operation_templates',
        sa.Column('template_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('rule_id', sa.Integer(), nullable=False),
        sa.Column('active_from', sa.Date(), nullable=False),
        sa.Column('active_until', sa.Date(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('kind', sa.String(32), nullable=False),
        sa.Column('amount', sa.Numeric(precision=20, scale=2), nullable=False),
        sa.Column('note', sa.String(512), nullable=True),
        sa.Column('wallet_id', sa.Integer(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=True),
        sa.Column('from_wallet_id', sa.Integer(), nullable=True),
        sa.Column('to_wallet_id', sa.Integer(), nullable=True),
        sa.Column('work_category_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 9. operation_occurrences
    op.create_table(
        'operation_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('template_id', sa.Integer(), nullable=False, index=True),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False, server_default='ACTIVE'),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('transaction_id', sa.Integer(), nullable=True),
        sa.UniqueConstraint('account_id', 'template_id', 'scheduled_date', name='uq_operation_occurrence'),
    )
    op.create_index('ix_op_occ_date', 'operation_occurrences', ['account_id', 'scheduled_date', 'status'])


def downgrade() -> None:
    """Drop all 9 tables."""
    op.drop_table('operation_occurrences')
    op.drop_table('operation_templates')
    op.drop_table('task_occurrences')
    op.drop_table('task_templates')
    op.drop_table('habit_occurrences')
    op.drop_table('habits')
    op.drop_table('tasks')
    op.drop_table('recurrence_rules')
    op.drop_table('work_categories')
