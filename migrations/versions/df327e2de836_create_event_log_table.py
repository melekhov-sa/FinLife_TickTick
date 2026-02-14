"""create_event_log_table

Revision ID: df327e2de836
Revises: a6cfa5919b59
Create Date: 2026-02-13 19:49:28.232536

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'df327e2de836'
down_revision: Union[str, Sequence[str], None] = 'a6cfa5919b59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'event_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('event_type', sa.String(length=128), nullable=False),
        sa.Column('payload_json', JSONB, nullable=False),
        sa.Column('occurred_at', sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column('idempotency_key', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Indexes для производительности
    op.create_index('ix_event_log_account_id', 'event_log', ['account_id'])
    op.create_index('ix_event_log_event_type', 'event_log', ['event_type'])
    op.create_index('ix_event_log_occurred_at', 'event_log', ['occurred_at'])
    op.create_index('ix_event_log_idempotency_key', 'event_log', ['idempotency_key'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_event_log_idempotency_key', table_name='event_log')
    op.drop_index('ix_event_log_occurred_at', table_name='event_log')
    op.drop_index('ix_event_log_event_type', table_name='event_log')
    op.drop_index('ix_event_log_account_id', table_name='event_log')
    op.drop_table('event_log')
