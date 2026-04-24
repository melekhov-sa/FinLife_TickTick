"""add FTS indexes for global search

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-04-24
"""
from alembic import op


revision = 'j3k4l5m6n7o8'
down_revision = 'i2j3k4l5m6n7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    try:
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_tasks_fts ON tasks USING GIN (
                to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,''))
            )
        """)
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_fts ON events USING GIN (
                to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(description,''))
            )
        """)
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_optemplates_fts ON operation_templates USING GIN (
                to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,''))
            )
        """)
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_txfeed_fts ON transactions_feed USING GIN (
                to_tsvector('russian', coalesce(description,''))
            )
        """)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.execute("DROP INDEX IF EXISTS idx_tasks_fts")
        op.execute("DROP INDEX IF EXISTS idx_events_fts")
        op.execute("DROP INDEX IF EXISTS idx_optemplates_fts")
        op.execute("DROP INDEX IF EXISTS idx_txfeed_fts")
    except Exception:
        pass
