"""add expression index for notification dedup

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-04-18
"""
from alembic import op

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL rejects `date(timestamptz)` in indexes (STABLE, not IMMUTABLE).
    # We use `(created_at AT TIME ZONE 'UTC')::date` which IS IMMUTABLE because
    # the TZ literal is fixed. Cleanup query uses the same expression so it
    # partitions on the same day-boundary as the index enforces.

    # Pre-cleanup: delete duplicates, keep MIN(id) per group.
    op.execute("""
        DELETE FROM notifications WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY
                        user_id,
                        rule_code,
                        COALESCE(entity_type, ''),
                        COALESCE(entity_id, -1),
                        (created_at AT TIME ZONE 'UTC')::date
                    ORDER BY id
                ) AS rn FROM notifications
            ) x WHERE rn > 1
        )
    """)

    # Create expression index. Raw SQL because op.create_index doesn't
    # cleanly support COALESCE + AT TIME ZONE across dialects.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedup
        ON notifications (
            user_id,
            rule_code,
            COALESCE(entity_type, ''),
            COALESCE(entity_id, -1),
            ((created_at AT TIME ZONE 'UTC')::date)
        )
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_notification_dedup")
