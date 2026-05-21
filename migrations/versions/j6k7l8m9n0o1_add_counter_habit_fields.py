"""add_counter_habit_fields

Revision ID: j6k7l8m9n0o1
Revises: i5j6k7l8m9n0
Create Date: 2026-05-21

Adds habit_type, target_count, unit_label to habits;
completion_count to habit_occurrences.
"""
from alembic import op
import sqlalchemy as sa

revision = 'j6k7l8m9n0o1'
down_revision = 'i5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('habits', sa.Column('habit_type', sa.String(32), nullable=False, server_default='binary'))
    op.add_column('habits', sa.Column('target_count', sa.Integer(), nullable=True))
    op.add_column('habits', sa.Column('unit_label', sa.String(64), nullable=True))
    op.add_column('habit_occurrences', sa.Column('completion_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('habit_occurrences', 'completion_count')
    op.drop_column('habits', 'unit_label')
    op.drop_column('habits', 'target_count')
    op.drop_column('habits', 'habit_type')
