"""create_football_matches

Revision ID: jj0k1l2m3n4o
Revises: ii9j0k1l2m3n
Create Date: 2026-05-29

"""
from alembic import op
import sqlalchemy as sa

revision = 'jj0k1l2m3n4o'
down_revision = 'ii9j0k1l2m3n'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'football_matches',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('external_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('match_date', sa.Date(), nullable=False),
        sa.Column('match_time', sa.String(10), nullable=True),
        sa.Column('home_team', sa.String(100), nullable=False),
        sa.Column('away_team', sa.String(100), nullable=False),
        sa.Column('competition', sa.String(100), nullable=False),
        sa.Column('venue', sa.String(100), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='NS'),
        sa.Column('score_home', sa.Integer(), nullable=True),
        sa.Column('score_away', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade():
    op.drop_table('football_matches')
