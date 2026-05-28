"""create_meal_plan

Revision ID: dd4e5f6g7h8i
Revises: cc3d4e5f6g7h
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'dd4e5f6g7h8i'
down_revision = 'cc3d4e5f6g7h'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'meal_plan_entries',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('week_start', sa.Date(), nullable=False),
        sa.Column('day_of_week', sa.SmallInteger(), nullable=False),
        sa.Column('meal_slot', sa.String(20), nullable=False),
        sa.Column('dish_name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_meal_plan_entries_account_week', 'meal_plan_entries', ['account_id', 'week_start'])
    op.create_unique_constraint(
        'uq_meal_plan_entry_slot',
        'meal_plan_entries',
        ['account_id', 'week_start', 'day_of_week', 'meal_slot'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_meal_plan_entry_slot', 'meal_plan_entries', type_='unique')
    op.drop_index('ix_meal_plan_entries_account_week', table_name='meal_plan_entries')
    op.drop_table('meal_plan_entries')
