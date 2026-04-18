"""Create task_id_seq sequence for atomic task ID generation

Revision ID: h1i2j3k4l5m6
Revises: g7b8c9d0e1f2
Create Date: 2026-04-18
"""
from alembic import op
import sqlalchemy as sa

revision = 'h1i2j3k4l5m6'
down_revision = 'g7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Current max task_id from event_log — the sequence must not reissue existing IDs.
    row = conn.execute(sa.text(
        "SELECT COALESCE(MAX((payload_json->>'task_id')::int), 0) "
        "FROM event_log WHERE event_type = 'task_created'"
    )).fetchone()
    max_id = row[0] if row else 0

    # Create sequence if absent, then advance it to max_id so nextval returns max_id+1.
    # GREATEST protects us from going backwards if the sequence was created earlier
    # at a higher value (manual creation, prior partial run, or re-upgrade).
    conn.execute(sa.text(
        f"""
        DO $$ BEGIN
            CREATE SEQUENCE task_id_seq;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END $$;
        """
    ))
    conn.execute(sa.text(
        f"SELECT setval('task_id_seq', GREATEST((SELECT last_value FROM task_id_seq), {max_id}), true)"
    ))


def downgrade():
    op.execute("DROP SEQUENCE IF EXISTS task_id_seq")
