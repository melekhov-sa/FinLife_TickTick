"""goal_saving_plans: округление взноса вверх до сотни

Делением почти всегда получается сумма с копейками — 1 454,55 в месяц
переводить неудобно. С этим флагом взнос округляется вверх до 100.

Существующие планы получают false: их суммы уже согласованы с бюджетом,
и менять их задним числом нельзя. Новые создаются с округлением — это
значение по умолчанию в API, а не в схеме.

Revision ID: gv1a2b3c4d5e
Revises: gu1a2b3c4d5e
"""
from alembic import op
import sqlalchemy as sa

revision = "gv1a2b3c4d5e"
down_revision = "gu1a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "goal_saving_plans",
        sa.Column("round_to_100", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("goal_saving_plans", "round_to_100")
