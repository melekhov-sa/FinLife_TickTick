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
    # Pre-cleanup: delete duplicates grouped by the same expression columns.
    # Keep MIN(id) per group.
    op.execute("""
        DELETE FROM notifications WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY
                        user_id,
                        rule_code,
                        COALESCE(entity_type, ''),
                        COALESCE(entity_id, -1),
                        date(created_at)
                    ORDER BY id
                ) AS rn FROM notifications
            ) x WHERE rn > 1
        )
    """)

    # Create expression index — Alembic op.create_index doesn't support COALESCE
    # across dialects cleanly, so raw SQL is used here.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_dedup
        ON notifications (
            user_id,
            rule_code,
            COALESCE(entity_type, ''),
            COALESCE(entity_id, -1),
            date(created_at)
        )
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_notification_dedup")
