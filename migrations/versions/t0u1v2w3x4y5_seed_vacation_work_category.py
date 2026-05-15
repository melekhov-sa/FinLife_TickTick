"""seed_vacation_work_category

Revision ID: t0u1v2w3x4y5
Revises: s2t3u4v5w6x7
Create Date: 2026-05-15

Adds predefined "Отпуск" 🏖️ work category for all existing users.
New users get it via lazy seeding in GET /api/v2/work-categories.
"""
from alembic import op

revision = "t0u1v2w3x4y5"
down_revision = "s2t3u4v5w6x7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$
        DECLARE
            current_max_id INTEGER;
            user_record RECORD;
        BEGIN
            SELECT COALESCE(MAX(category_id), 0) INTO current_max_id FROM work_categories;

            FOR user_record IN
                SELECT id FROM users
                WHERE NOT EXISTS (
                    SELECT 1 FROM work_categories wc
                    WHERE wc.account_id = users.id
                      AND lower(wc.title) = 'отпуск'
                )
            LOOP
                current_max_id := current_max_id + 1;
                INSERT INTO work_categories
                    (category_id, account_id, title, emoji, is_archived, created_at, updated_at)
                VALUES
                    (current_max_id, user_record.id, 'Отпуск', '🏖️', false, NOW(), NOW());
            END LOOP;
        END $$;
    """)


def downgrade() -> None:
    op.execute("""
        DELETE FROM work_categories
        WHERE lower(title) = 'отпуск' AND emoji = '🏖️';
    """)
