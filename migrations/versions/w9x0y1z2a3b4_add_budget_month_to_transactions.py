"""Add budget_month override to transactions_feed

Операция может учитываться в бюджете не в месяце своей даты:
зарплата 31 января «по смыслу» февральская. budget_month — первое число
целевого месяца; NULL = учитывать по occurred_at (поведение по умолчанию).

Revision ID: w9x0y1z2a3b4
Revises: q7r8s9t0u1v2
"""
import sqlalchemy as sa
from alembic import op

revision = "w9x0y1z2a3b4"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transactions_feed",
        sa.Column("budget_month", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("transactions_feed", "budget_month")
