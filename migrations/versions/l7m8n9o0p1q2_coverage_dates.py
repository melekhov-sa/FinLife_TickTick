"""switch coverage from start_month+months_count to start_date+end_date

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa


revision = 'l7m8n9o0p1q2'
down_revision = 'k6l7m8n9o0p1'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Rename start_month -> start_date
    op.alter_column('subscription_coverages', 'start_month',
                    new_column_name='start_date')

    # 2. Add end_date (temporarily nullable)
    op.add_column('subscription_coverages',
        sa.Column('end_date', sa.Date(), nullable=True))

    # 3. Data migration: end_date = start_date + months_count months - 1 day
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE subscription_coverages
        SET end_date = (start_date + (months_count || ' months')::interval - interval '1 day')::date
    """))

    # 4. Make end_date NOT NULL
    op.alter_column('subscription_coverages', 'end_date', nullable=False)

    # 5. Drop months_count
    op.drop_column('subscription_coverages', 'months_count')


def downgrade():
    # 1. Add months_count back
    op.add_column('subscription_coverages',
        sa.Column('months_count', sa.Integer(), nullable=True))

    # 2. Compute months_count from start_date and end_date
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE subscription_coverages
        SET months_count = GREATEST(
            (EXTRACT(YEAR FROM (end_date + interval '1 day')) - EXTRACT(YEAR FROM start_date)) * 12
            + (EXTRACT(MONTH FROM (end_date + interval '1 day')) - EXTRACT(MONTH FROM start_date)),
            1
        )::int
    """))

    # 3. Make months_count NOT NULL
    op.alter_column('subscription_coverages', 'months_count', nullable=False)

    # 4. Drop end_date
    op.drop_column('subscription_coverages', 'end_date')

    # 5. Rename start_date -> start_month
    op.alter_column('subscription_coverages', 'start_date',
                    new_column_name='start_month')
