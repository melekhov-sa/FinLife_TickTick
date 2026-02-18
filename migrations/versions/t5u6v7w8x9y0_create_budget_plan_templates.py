"""create budget_plan_templates table

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-02-18 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 't5u6v7w8x9y0'
down_revision: str = 's4t5u6v7w8x9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budget_plan_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('budget_variant_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(20), nullable=False),
        sa.Column('default_planned_amount', sa.Numeric(precision=20, scale=2), server_default='0', nullable=False),
        sa.Column('position', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('budget_variant_id', 'category_id', 'kind', name='uq_budget_plan_template'),
    )
    op.create_index('ix_budget_plan_template_variant', 'budget_plan_templates', ['budget_variant_id'])
    op.create_index('ix_budget_plan_template_account', 'budget_plan_templates', ['account_id'])


def downgrade() -> None:
    op.drop_index('ix_budget_plan_template_account', table_name='budget_plan_templates')
    op.drop_index('ix_budget_plan_template_variant', table_name='budget_plan_templates')
    op.drop_table('budget_plan_templates')
