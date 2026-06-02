"""add_dish_catalog

Revision ID: ll2m3n4o5p6q
Revises: kk1l2m3n4o5p
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'll2m3n4o5p6q'
down_revision = 'kk1l2m3n4o5p'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'dishes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('meal_types', sa.Text(), nullable=True),
        sa.Column('instructions', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dishes_account_id', 'dishes', ['account_id'])

    op.create_table(
        'dish_ingredients',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('dish_id', sa.Integer(), nullable=False),
        sa.Column('ingredient_name', sa.Text(), nullable=False),
        sa.Column('quantity', sa.String(50), nullable=True),
        sa.Column('unit', sa.String(30), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['dish_id'], ['dishes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_dish_ingredients_dish_id', 'dish_ingredients', ['dish_id'])

    op.add_column('meal_plan_entries', sa.Column('dish_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_meal_plan_entries_dish_id',
        'meal_plan_entries', 'dishes',
        ['dish_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_meal_plan_entries_dish_id', 'meal_plan_entries', type_='foreignkey')
    op.drop_column('meal_plan_entries', 'dish_id')
    op.drop_index('ix_dish_ingredients_dish_id', table_name='dish_ingredients')
    op.drop_table('dish_ingredients')
    op.drop_index('ix_dishes_account_id', table_name='dishes')
    op.drop_table('dishes')
