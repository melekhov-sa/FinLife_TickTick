"""event_task_templates

Revision ID: i5j6k7l8m9n0
Revises: h4i5j6k7l8m9
Create Date: 2026-05-21

Adds:
- event_task_templates table (templates for auto-created tasks linked to events)
- event_occurrence_tasks table (deduplication tracking per occurrence)
"""
from alembic import op
import sqlalchemy as sa

revision = 'i5j6k7l8m9n0'
down_revision = 'h4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'event_task_templates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('event_id', sa.Integer(), sa.ForeignKey('events.event_id', ondelete='CASCADE'), nullable=False),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('days_before', sa.Integer(), nullable=False),
        sa.Column('reminder_offset_minutes', sa.Integer(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
    )
    op.create_index('ix_event_task_tpl_event', 'event_task_templates', ['event_id'])
    op.create_index('ix_event_task_tpl_account', 'event_task_templates', ['account_id'])

    op.create_table(
        'event_occurrence_tasks',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('event_task_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('occurrence_date', sa.Date(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.UniqueConstraint('template_id', 'occurrence_date', name='uq_event_occ_task'),
    )
    op.create_index('ix_event_occ_task_tpl', 'event_occurrence_tasks', ['template_id'])


def downgrade():
    op.drop_table('event_occurrence_tasks')
    op.drop_table('event_task_templates')
