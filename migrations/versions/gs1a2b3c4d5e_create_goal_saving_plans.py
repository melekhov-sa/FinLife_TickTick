"""create goal_saving_plans

Накопительный план на цель: «к декабрю нужно 30 000, откладывать с
января». Бюджет из этого сам считает помесячный взнос и заполняет
строку «Отложить».

Отдельная таблица, а не поля в goals: у копилки может не быть срока
вовсе, а планов на одну цель бывает несколько — копим и на страховку,
и на шины в общее «Авто».

Revision ID: gs1a2b3c4d5e
Revises: ac1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "gs1a2b3c4d5e"
down_revision = "ac1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "goal_saving_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("goal_id", sa.Integer(), nullable=False),
        sa.Column("target_amount", sa.Numeric(precision=20, scale=2), nullable=False),
        # Месяцы как YYYY-MM: день здесь не значит ничего, а строка
        # сравнивается лексикографически — это ровно хронологический порядок.
        sa.Column("start_month", sa.String(length=7), nullable=False),
        sa.Column("target_month", sa.String(length=7), nullable=False),
        sa.Column("save_in_target_month", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("repeat_yearly", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_goal_saving_plans_account", "goal_saving_plans", ["account_id"])
    op.create_index("ix_goal_saving_plans_goal", "goal_saving_plans", ["goal_id"])


def downgrade() -> None:
    op.drop_index("ix_goal_saving_plans_goal", table_name="goal_saving_plans")
    op.drop_index("ix_goal_saving_plans_account", table_name="goal_saving_plans")
    op.drop_table("goal_saving_plans")
