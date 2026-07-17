"""Проверки перед событием / одиночные да-нет вопросы

«Турнир завтра, взнос 900₽ наличными — деньги есть?» → Да: записали;
Нет: создаём задачу на выбранную дату. Вопрос всплывает в приложении.

Revision ID: i7d8e9f0a1b2
Revises: h6c7d8e9f0a1
"""
import sqlalchemy as sa
from alembic import op

revision = "i7d8e9f0a1b2"
down_revision = "h6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "checks",
        sa.Column("check_id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("question", sa.String(500), nullable=False),
        # Либо привязка к событию (спрашиваем перед каждым повторением)…
        sa.Column("event_id", sa.Integer, nullable=True),
        sa.Column("days_before", sa.Integer, nullable=False, server_default="1"),
        # …либо одиночный вопрос на конкретную дату
        sa.Column("ask_date", sa.Date, nullable=True),
        sa.Column("fallback_task_title", sa.String(300), nullable=True),
        sa.Column("is_archived", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
    )
    op.create_index("ix_checks_account_id", "checks", ["account_id"])
    op.create_index("ix_checks_event_id", "checks", ["event_id"])

    op.create_table(
        "check_answers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "check_id", sa.Integer,
            sa.ForeignKey("checks.check_id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("occurrence_date", sa.Date, nullable=False),
        sa.Column("answer", sa.String(8), nullable=False),  # YES | NO
        sa.Column("task_id", sa.Integer, nullable=True),
        sa.Column(
            "answered_at", sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"), nullable=False,
        ),
        sa.UniqueConstraint("check_id", "occurrence_date", name="uq_check_answer"),
    )
    op.create_index("ix_check_answers_account_id", "check_answers", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_check_answers_account_id", table_name="check_answers")
    op.drop_table("check_answers")
    op.drop_index("ix_checks_event_id", table_name="checks")
    op.drop_index("ix_checks_account_id", table_name="checks")
    op.drop_table("checks")
