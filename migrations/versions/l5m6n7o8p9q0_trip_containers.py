"""add trip containers: shared_lists trip fields, tasks/transactions list_id, list_plan_items

Revision ID: l5m6n7o8p9q0
Revises: k4l5m6n7o8p9
Create Date: 2026-04-24
"""
from alembic import op


revision = 'l5m6n7o8p9q0'
down_revision = 'k4l5m6n7o8p9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── shared_lists: trip fields ────────────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(20,2);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS period_from DATE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS period_to DATE;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)

    # ── tasks: list_id ───────────────────────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE tasks ADD COLUMN IF NOT EXISTS list_id INTEGER;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS ix_tasks_list_id ON tasks(list_id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)

    # ── transactions_feed: list_id ───────────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE transactions_feed ADD COLUMN IF NOT EXISTS list_id INTEGER;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS ix_txfeed_list_id ON transactions_feed(list_id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)

    # ── list_plan_items ──────────────────────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE TABLE IF NOT EXISTS list_plan_items (
                    id SERIAL PRIMARY KEY,
                    list_id INTEGER NOT NULL,
                    account_id INTEGER NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    amount NUMERIC(20,2) NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                CREATE INDEX IF NOT EXISTS ix_list_plan_items_list_id ON list_plan_items(list_id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_list_plan_items_list_id")
    op.execute("DROP TABLE IF EXISTS list_plan_items")
    op.execute("DROP INDEX IF EXISTS ix_txfeed_list_id")
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE transactions_feed DROP COLUMN IF EXISTS list_id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("DROP INDEX IF EXISTS ix_tasks_list_id")
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE tasks DROP COLUMN IF EXISTS list_id;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists DROP COLUMN IF EXISTS period_to;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists DROP COLUMN IF EXISTS period_from;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
    op.execute("""
        DO $$
        BEGIN
            BEGIN
                ALTER TABLE shared_lists DROP COLUMN IF EXISTS budget_amount;
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END $$;
    """)
