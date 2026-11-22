"""goal_saving_plans: что план делает в целевом месяце

Копить — половина дела. В целевом месяце деньги надо забрать из
отложенного и потратить, и до сих пор это приходилось вписывать руками,
хотя план знает и месяц, и сумму.

withdraw_in_target  — подставлять «Взять из отложенного» в целевом месяце
expense_category_id — и плановый расход в эту статью (необязательно)

Revision ID: gu1a2b3c4d5e
Revises: gt1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "gu1a2b3c4d5e"
down_revision = "gt1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goal_saving_plans",
        sa.Column("withdraw_in_target", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "goal_saving_plans",
        sa.Column("expense_category_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("goal_saving_plans", "expense_category_id")
    op.drop_column("goal_saving_plans", "withdraw_in_target")
