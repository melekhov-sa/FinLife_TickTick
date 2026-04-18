"""add unique constraints to occurrence tables

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-18
"""
from alembic import op

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # habit_occurrences — has status column; keep DONE row or MIN(id)    #
    # ------------------------------------------------------------------ #
    op.execute("""
        DELETE FROM habit_occurrences WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY account_id, habit_id, scheduled_date
                    ORDER BY CASE WHEN status = 'DONE' THEN 0 ELSE 1 END, id
                ) AS rn FROM habit_occurrences
            ) x WHERE rn > 1
        )
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE habit_occurrences ADD CONSTRAINT uq_habit_occurrence
                UNIQUE (account_id, habit_id, scheduled_date);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN duplicate_table THEN NULL;
        END $$
    """)

    # ------------------------------------------------------------------ #
    # task_occurrences — has status column; keep DONE row or MIN(id)     #
    # ------------------------------------------------------------------ #
    op.execute("""
        DELETE FROM task_occurrences WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY account_id, template_id, scheduled_date
                    ORDER BY CASE WHEN status = 'DONE' THEN 0 ELSE 1 END, id
                ) AS rn FROM task_occurrences
            ) x WHERE rn > 1
        )
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE task_occurrences ADD CONSTRAINT uq_task_occurrence
                UNIQUE (account_id, template_id, scheduled_date);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN duplicate_table THEN NULL;
        END $$
    """)

    # ------------------------------------------------------------------ #
    # operation_occurrences — has status column; keep DONE row or MIN(id)#
    # ------------------------------------------------------------------ #
    op.execute("""
        DELETE FROM operation_occurrences WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY account_id, template_id, scheduled_date
                    ORDER BY CASE WHEN status = 'DONE' THEN 0 ELSE 1 END, id
                ) AS rn FROM operation_occurrences
            ) x WHERE rn > 1
        )
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE operation_occurrences ADD CONSTRAINT uq_operation_occurrence
                UNIQUE (account_id, template_id, scheduled_date);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN duplicate_table THEN NULL;
        END $$
    """)

    # ------------------------------------------------------------------ #
    # event_occurrences — no status column; keep MIN(id)                 #
    # ------------------------------------------------------------------ #
    op.execute("""
        DELETE FROM event_occurrences WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY account_id, event_id, start_date, source
                    ORDER BY id
                ) AS rn FROM event_occurrences
            ) x WHERE rn > 1
        )
    """)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE event_occurrences ADD CONSTRAINT uq_event_occurrence
                UNIQUE (account_id, event_id, start_date, source);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN duplicate_table THEN NULL;
        END $$
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE habit_occurrences DROP CONSTRAINT IF EXISTS uq_habit_occurrence")
    op.execute("ALTER TABLE task_occurrences DROP CONSTRAINT IF EXISTS uq_task_occurrence")
    op.execute("ALTER TABLE operation_occurrences DROP CONSTRAINT IF EXISTS uq_operation_occurrence")
    op.execute("ALTER TABLE event_occurrences DROP CONSTRAINT IF EXISTS uq_event_occurrence")
