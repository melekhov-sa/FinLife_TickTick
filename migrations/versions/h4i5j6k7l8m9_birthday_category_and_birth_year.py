"""birthday_category_and_birth_year

Revision ID: a1b2c3d4e5f6
Revises: z9a0b1c2d3e4
Create Date: 2026-05-21

Adds:
- slug + is_system columns to work_categories
- birth_year column to events
- Seeds "День рождения" system category for all existing users
"""
from alembic import op
import sqlalchemy as sa

revision = 'h4i5j6k7l8m9'
down_revision = 'g3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('work_categories', sa.Column('slug', sa.String(64), nullable=True))
    op.add_column('work_categories', sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('events', sa.Column('birth_year', sa.Integer(), nullable=True))

    # Mark existing "День рождения" categories as system (by title, case-insensitive)
    op.execute("""
        UPDATE work_categories
        SET slug = 'birthday', is_system = true
        WHERE lower(title) = 'день рождения' AND slug IS NULL
    """)

    # For users who have no birthday category at all — create one (manual ID, no sequence)
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
                    WHERE wc.account_id = users.id AND wc.slug = 'birthday'
                )
            LOOP
                current_max_id := current_max_id + 1;
                INSERT INTO work_categories
                    (category_id, account_id, title, emoji, slug, is_system, is_archived, created_at)
                VALUES
                    (current_max_id, user_record.id, 'День рождения', '🎂', 'birthday', true, false, NOW());
            END LOOP;
        END $$;
    """)


def downgrade():
    op.drop_column('events', 'birth_year')
    op.execute("UPDATE work_categories SET slug = NULL, is_system = false WHERE slug = 'birthday'")
    op.drop_column('work_categories', 'is_system')
    op.drop_column('work_categories', 'slug')
