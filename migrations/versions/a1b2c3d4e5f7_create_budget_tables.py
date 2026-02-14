"""create budget tables

Revision ID: a1b2c3d4e5f7
Revises: f1b2c3d4e5f6
Create Date: 2026-02-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_months',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('account_id', 'year', 'month', name='uq_budget_month'),
    )

    op.create_table(
        'budget_lines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('budget_month_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False, index=True),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('plan_amount', sa.Numeric(precision=20, scale=2), nullable=False, server_default='0'),
        sa.Column('note', sa.String(512), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('budget_month_id', 'category_id', 'kind', name='uq_budget_line'),
    )

    op.create_index('ix_budget_line_month', 'budget_lines', ['budget_month_id'])


def downgrade() -> None:
    op.drop_index('ix_budget_line_month', table_name='budget_lines')
    op.drop_table('budget_lines')
    op.drop_table('budget_months')
