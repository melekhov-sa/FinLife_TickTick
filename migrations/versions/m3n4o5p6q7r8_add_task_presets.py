"""add task presets

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-02-21 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'm3n4o5p6q7r8'
down_revision: str = 'l2m3n4o5p6q7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. User setting
    op.add_column('users', sa.Column('enable_task_templates', sa.Boolean(),
                                     server_default='false', nullable=False))

    # 2. Task presets table
    op.create_table(
        'task_presets',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('account_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('title_template', sa.Text(), nullable=False),
        sa.Column('description_template', sa.Text(), nullable=True),
        sa.Column('default_task_category_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(),
                  nullable=False),
    )
    op.create_index('ix_task_presets_account_id', 'task_presets', ['account_id'])


def downgrade() -> None:
    op.drop_index('ix_task_presets_account_id', table_name='task_presets')
    op.drop_table('task_presets')
    op.drop_column('users', 'enable_task_templates')
