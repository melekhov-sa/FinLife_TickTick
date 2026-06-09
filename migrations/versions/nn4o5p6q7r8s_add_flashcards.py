"""add flashcards

Revision ID: nn4o5p6q7r8s
Revises: mm3n4o5p6q7r
Create Date: 2026-06-09

"""
from alembic import op
import sqlalchemy as sa

revision = 'nn4o5p6q7r8s'
down_revision = 'mm3n4o5p6q7r'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'flashcard_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=True),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'flashcards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('word', sa.String(200), nullable=False),
        sa.Column('short_definition', sa.String(500), nullable=False),
        sa.Column('simple_explanation', sa.Text(), nullable=False),
        sa.Column('example', sa.Text(), nullable=False),
        sa.Column('difficulty', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['category_id'], ['flashcard_categories.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'user_flashcard_progress',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('flashcard_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='new'),
        sa.Column('interval_days', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('ease_factor', sa.Numeric(4, 2), nullable=False, server_default='2.5'),
        sa.Column('next_review_at', sa.Date(), nullable=True),
        sa.Column('repetitions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('wrong_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('first_seen_at', sa.DateTime(), nullable=True),
        sa.Column('last_reviewed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['flashcard_id'], ['flashcards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('account_id', 'flashcard_id', name='uq_user_flashcard'),
    )

    op.create_index('ix_user_flashcard_progress_account', 'user_flashcard_progress', ['account_id'])
    op.create_index('ix_user_flashcard_progress_next_review', 'user_flashcard_progress', ['account_id', 'next_review_at'])


def downgrade() -> None:
    op.drop_table('user_flashcard_progress')
    op.drop_table('flashcards')
    op.drop_table('flashcard_categories')
