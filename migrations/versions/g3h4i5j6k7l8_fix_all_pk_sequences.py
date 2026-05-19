"""Fix all primary-key sequences that may be out-of-sync with table data

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-05-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'g3h4i5j6k7l8'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None

# (sequence_name, table_name, pk_column)
_SEQUENCES = [
    ('operation_templates_template_id_seq', 'operation_templates', 'template_id'),
    ('operation_occurrences_id_seq',        'operation_occurrences', 'id'),
    ('recurrence_rules_rule_id_seq',        'recurrence_rules',      'rule_id'),
]


def upgrade() -> None:
    conn = op.get_bind()
    for seq, tbl, col in _SEQUENCES:
        conn.execute(sa.text(
            f"SELECT setval('{seq}', "
            f"GREATEST((SELECT COALESCE(MAX({col}), 1) FROM {tbl}), "
            f"(SELECT last_value FROM {seq})))"
        ))


def downgrade() -> None:
    pass
