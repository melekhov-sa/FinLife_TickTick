"""Долги и займы: debts + debt_payments + правило уведомлений DEBT_DUE

Полноценный механизм вместо учёта статьями: кому/от кого, сумма,
срок возврата, частичные возвраты, баланс «мне должны / я должен».

Revision ID: d2e3f4a5b6c7
Revises: c0d1e2f3a4b5
"""
import sqlalchemy as sa
from alembic import op

revision = "d2e3f4a5b6c7"
down_revision = "c0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "debts",
        sa.Column("debt_id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),  # LENT | BORROWED
        sa.Column("counterparty", sa.String(255), nullable=False),
        sa.Column("contact_id", sa.Integer, nullable=True),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="RUB"),
        sa.Column("opened_date", sa.Date, nullable=False),
        sa.Column("due_date", sa.Date, nullable=True),
        sa.Column("note", sa.Text, nullable=False, server_default=""),
        sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
        sa.Column("closed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_debts_account_id", "debts", ["account_id"])

    op.create_table(
        "debt_payments",
        sa.Column("payment_id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "debt_id", sa.Integer,
            sa.ForeignKey("debts.debt_id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("paid_date", sa.Date, nullable=False),
        sa.Column("note", sa.String(500), nullable=False, server_default=""),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_debt_payments_debt_id", "debt_payments", ["debt_id"])
    op.create_index("ix_debt_payments_account_id", "debt_payments", ["account_id"])

    op.execute(
        "INSERT INTO notification_rules (code, title, description) VALUES "
        "('DEBT_DUE', 'Долг: срок возврата', "
        "'Открытый долг: срок сегодня, просрочен или наступает в ближайшие 3 дня')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM notification_rules WHERE code = 'DEBT_DUE'")
    op.drop_index("ix_debt_payments_account_id", table_name="debt_payments")
    op.drop_index("ix_debt_payments_debt_id", table_name="debt_payments")
    op.drop_table("debt_payments")
    op.drop_index("ix_debts_account_id", table_name="debts")
    op.drop_table("debts")
