"""add subscription notification settings and notification log

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-02-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1l2m3n4o5p6'
down_revision: str = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Notification settings on subscriptions
    op.add_column('subscriptions', sa.Column('notify_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('subscriptions', sa.Column('notify_days_before', sa.Integer(), nullable=True))

    # Notification log table (prevents duplicate notifications)
    op.create_table(
        'subscription_notification_log',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('subscription_id', sa.Integer(), nullable=False, index=True),
        sa.Column('member_id', sa.Integer(), nullable=True),
        sa.Column('notified_for_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('subscription_id', 'member_id', 'notified_for_date',
                            name='uq_sub_notification_log'),
    )


def downgrade() -> None:
    op.drop_table('subscription_notification_log')
    op.drop_column('subscriptions', 'notify_days_before')
    op.drop_column('subscriptions', 'notify_enabled')
