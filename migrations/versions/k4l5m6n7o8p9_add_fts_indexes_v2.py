"""add FTS indexes v2 for habits, goals, subscriptions, contacts, articles

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-04-24
"""
from alembic import op


revision = 'k4l5m6n7o8p9'
down_revision = 'j3k4l5m6n7o8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_habits_fts ON habits USING GIN (
                    to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(note,''))
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_goals_fts ON goals USING GIN (
                    to_tsvector('russian', coalesce(title,''))
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_subscriptions_fts ON subscriptions USING GIN (
                    to_tsvector('russian', coalesce(name,''))
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_contacts_fts ON contacts USING GIN (
                    to_tsvector('russian', coalesce(name,'') || ' ' || coalesce(note,''))
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_articles_fts ON articles USING GIN (
                    to_tsvector('russian', coalesce(title,'') || ' ' || coalesce(content_md,''))
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_habits_fts")
    op.execute("DROP INDEX IF EXISTS idx_goals_fts")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_fts")
    op.execute("DROP INDEX IF EXISTS idx_contacts_fts")
    op.execute("DROP INDEX IF EXISTS idx_articles_fts")
