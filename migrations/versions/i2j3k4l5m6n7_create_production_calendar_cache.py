"""create production_calendar_cache table

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-04-19
"""
from alembic import op


revision = 'i2j3k4l5m6n7'
down_revision = 'h1i2j3k4l5m6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Raw SQL with IF NOT EXISTS + DO/EXCEPTION wrap handles two cases:
    #   1. Prod already has this table from a partial previous run
    #      (CREATE TABLE IF NOT EXISTS handles it cleanly)
    #   2. Prod has an orphan pg_type row but no table — rare but possible
    #      after an interrupted CREATE; the EXCEPTION clauses eat it.
    # Also: year is a plain INTEGER primary key (we insert 2026, 2027, ...),
    # NOT a SERIAL — Alembic's autoincrement="auto" default generated SERIAL
    # on the previous revision of this migration, which was wrong.
    op.execute("""
        DO $$ BEGIN
            CREATE TABLE IF NOT EXISTS production_calendar_cache (
                year INTEGER PRIMARY KEY,
                day_types_json JSONB NOT NULL,
                fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
            );
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN duplicate_table THEN NULL;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS production_calendar_cache")
