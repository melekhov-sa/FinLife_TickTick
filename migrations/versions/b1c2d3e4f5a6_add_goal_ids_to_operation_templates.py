"""add_goal_ids_to_operation_templates

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5a6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('operation_templates', sa.Column('from_goal_id', sa.Integer(), nullable=True))
    op.add_column('operation_templates', sa.Column('to_goal_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('operation_templates', 'to_goal_id')
    op.drop_column('operation_templates', 'from_goal_id')
