"""add mandatory_categories

Revision ID: p5q6r7s8t9u0
Revises: nn4o5p6q7r8s
Create Date: 2026-06-20

"""
from alembic import op
import sqlalchemy as sa

revision = 'p5q6r7s8t9u0'
down_revision = 'nn4o5p6q7r8s'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mandatory_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'category_id', name='uq_mandatory_category'),
    )
    op.create_index('ix_mandatory_categories_account', 'mandatory_categories', ['account_id'])


def downgrade() -> None:
    op.drop_table('mandatory_categories')
