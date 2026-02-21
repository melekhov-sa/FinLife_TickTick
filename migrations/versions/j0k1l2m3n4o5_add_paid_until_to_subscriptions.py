"""add paid_until to subscriptions and subscription_members

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-02-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j0k1l2m3n4o5'
down_revision: str = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('subscriptions', sa.Column('paid_until_self', sa.Date(), nullable=True))
    op.add_column('subscription_members', sa.Column('paid_until', sa.Date(), nullable=True))

    # Backfill paid_until_self from existing SELF coverages
    op.execute("""
        UPDATE subscriptions s
        SET paid_until_self = sub.max_end
        FROM (
            SELECT subscription_id, MAX(end_date) AS max_end
            FROM subscription_coverages
            WHERE payer_type = 'SELF'
            GROUP BY subscription_id
        ) sub
        WHERE s.id = sub.subscription_id
    """)

    # Backfill member paid_until from existing MEMBER coverages
    op.execute("""
        UPDATE subscription_members m
        SET paid_until = sub.max_end
        FROM (
            SELECT member_id, MAX(end_date) AS max_end
            FROM subscription_coverages
            WHERE payer_type = 'MEMBER' AND member_id IS NOT NULL
            GROUP BY member_id
        ) sub
        WHERE m.id = sub.member_id
    """)


def downgrade() -> None:
    op.drop_column('subscription_members', 'paid_until')
    op.drop_column('subscriptions', 'paid_until_self')
