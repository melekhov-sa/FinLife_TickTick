"""create events tables

Revision ID: e7a3b1c94f02
Revises: c3a1f7e89d01
Create Date: 2026-02-14 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a3b1c94f02'
down_revision: Union[str, Sequence[str], None] = 'c3a1f7e89d01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create 5 tables for calendar events."""

    # 1. events (calendar event cards/templates)
    op.create_table(
        'events',
        sa.Column('event_id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('importance', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('repeat_rule_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. event_occurrences (calendar fact instances)
    op.create_table(
        'event_occurrences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('event_id', sa.Integer(), nullable=False, index=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('end_time', sa.Time(), nullable=True),
        sa.Column('is_cancelled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('source', sa.String(16), nullable=False, server_default="'manual'"),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('account_id', 'event_id', 'start_date', 'source', name='uq_event_occurrence'),
    )
    op.create_index('ix_event_occ_date', 'event_occurrences', ['account_id', 'start_date'])

    # 3. event_reminders (per occurrence)
    op.create_table(
        'event_reminders',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('occurrence_id', sa.Integer(), nullable=False, index=True),
        sa.Column('channel', sa.String(16), nullable=False),
        sa.Column('mode', sa.String(16), nullable=False),
        sa.Column('offset_minutes', sa.Integer(), nullable=True),
        sa.Column('fixed_time', sa.Time(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 4. event_default_reminders (per event, copied to occurrences on generation)
    op.create_table(
        'event_default_reminders',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('event_id', sa.Integer(), nullable=False, index=True),
        sa.Column('channel', sa.String(16), nullable=False),
        sa.Column('mode', sa.String(16), nullable=False),
        sa.Column('offset_minutes', sa.Integer(), nullable=True),
        sa.Column('fixed_time', sa.Time(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 5. event_filter_presets (dashboard category filter presets)
    op.create_table(
        'event_filter_presets',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('category_ids_json', sa.Text(), nullable=False, server_default="'[]'"),
        sa.Column('is_selected', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    """Drop all 5 events tables."""
    op.drop_table('event_filter_presets')
    op.drop_table('event_default_reminders')
    op.drop_table('event_reminders')
    op.drop_table('event_occurrences')
    op.drop_table('events')
