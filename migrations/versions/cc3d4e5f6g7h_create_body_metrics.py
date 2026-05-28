"""create_body_metrics

Revision ID: cc3d4e5f6g7h
Revises: bb2c3d4e5f6g
Create Date: 2026-05-28

"""
from alembic import op
import sqlalchemy as sa

revision = 'cc3d4e5f6g7h'
down_revision = 'bb2c3d4e5f6g'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'body_metrics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('value', sa.Numeric(8, 2), nullable=False),
        sa.Column('value2', sa.Numeric(8, 2), nullable=True),
        sa.Column('recorded_at', sa.Date(), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_body_metrics_account_type_date', 'body_metrics',
                    ['account_id', 'metric_type', 'recorded_at'])


def downgrade() -> None:
    op.drop_index('ix_body_metrics_account_type_date', table_name='body_metrics')
    op.drop_table('body_metrics')
