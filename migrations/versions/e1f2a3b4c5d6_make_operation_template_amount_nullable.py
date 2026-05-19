"""make_operation_template_amount_nullable

Revision ID: e1f2a3b4c5d6
Revises: c2d3e4f5a6b7
Create Date: 2026-05-19

"""
from alembic import op
import sqlalchemy as sa

revision = 'e1f2a3b4c5d6'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'operation_templates', 'amount',
        existing_type=sa.Numeric(precision=20, scale=2),
        nullable=True,
    )


def downgrade() -> None:
    op.execute("UPDATE operation_templates SET amount = 0 WHERE amount IS NULL")
    op.alter_column(
        'operation_templates', 'amount',
        existing_type=sa.Numeric(precision=20, scale=2),
        nullable=False,
    )
