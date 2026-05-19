"""Fix recurrence_rules_rule_id_seq out-of-sync with table data

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'f2a3b4c5d6e7'
down_revision = 'e1f2a3b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    # Advance the sequence to current MAX so next INSERT doesn't collide.
    # This happens when rows were inserted with explicit IDs (e.g. via seed
    # scripts or manual DB operations) bypassing the sequence.
    conn.execute(sa.text(
        "SELECT setval('recurrence_rules_rule_id_seq', "
        "GREATEST((SELECT COALESCE(MAX(rule_id), 1) FROM recurrence_rules), "
        "(SELECT last_value FROM recurrence_rules_rule_id_seq)))"
    ))


def downgrade() -> None:
    pass
