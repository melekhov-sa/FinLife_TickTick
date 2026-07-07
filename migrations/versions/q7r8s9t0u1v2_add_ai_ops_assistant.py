"""AI operations assistant: merchant_rules, ai_parse_logs, wallet_bank_refs

Revision ID: q7r8s9t0u1v2
Revises: p5q6r7s8t9u0
Create Date: 2026-07-07
"""
import sqlalchemy as sa
from alembic import op

revision = "q7r8s9t0u1v2"
down_revision = "p5q6r7s8t9u0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "merchant_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("merchant_key", sa.String(length=128), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("wallet_id", sa.Integer(), nullable=True),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("account_id", "merchant_key", name="uq_merchant_rule"),
    )
    op.create_index("ix_merchant_rules_account_id", "merchant_rules", ["account_id"])

    op.create_table(
        "ai_parse_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("proposals_json", sa.Text(), nullable=False),
        sa.Column("final_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("engine", sa.String(length=16), nullable=False, server_default="llm"),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_ai_parse_logs_account_id", "ai_parse_logs", ["account_id"])

    op.create_table(
        "wallet_bank_refs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("ref_type", sa.String(length=8), nullable=False),
        sa.Column("ref_digits", sa.String(length=8), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("account_id", "ref_digits", name="uq_wallet_bank_ref"),
    )
    op.create_index("ix_wallet_bank_refs_account_id", "wallet_bank_refs", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_wallet_bank_refs_account_id", table_name="wallet_bank_refs")
    op.drop_table("wallet_bank_refs")
    op.drop_index("ix_ai_parse_logs_account_id", table_name="ai_parse_logs")
    op.drop_table("ai_parse_logs")
    op.drop_index("ix_merchant_rules_account_id", table_name="merchant_rules")
    op.drop_table("merchant_rules")
