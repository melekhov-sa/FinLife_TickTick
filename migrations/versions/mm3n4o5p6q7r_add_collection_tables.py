"""add collection tables

Revision ID: mm3n4o5p6q7r
Revises: ll2m3n4o5p6q
Create Date: 2026-06-08

"""
from alembic import op
import sqlalchemy as sa

revision = 'mm3n4o5p6q7r'
down_revision = 'll2m3n4o5p6q'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── collection_categories ────────────────────────────────────────────────
    op.create_table(
        'collection_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('emoji', sa.String(10), nullable=True),
        # serial | name | pokemon
        sa.Column('tracking_type', sa.String(20), nullable=False, server_default='name'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_collection_categories_account_id', 'collection_categories', ['account_id'])

    # ── collection_items ─────────────────────────────────────────────────────
    op.create_table(
        'collection_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),

        # Common identifier (name or serial_number)
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('serial_number', sa.String(100), nullable=True),

        # Banknote-specific
        sa.Column('denomination', sa.String(50), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('issue_year', sa.Integer(), nullable=True),
        sa.Column('series', sa.String(50), nullable=True),

        # Pokemon-specific
        sa.Column('pokemon_card_id', sa.String(50), nullable=True),  # e.g. "base1-4"
        sa.Column('pokemon_set_name', sa.String(150), nullable=True),
        sa.Column('pokemon_card_number', sa.String(20), nullable=True),
        sa.Column('pokemon_rarity', sa.String(80), nullable=True),
        sa.Column('pokemon_image_url', sa.String(500), nullable=True),

        # Financial
        sa.Column('acquisition_date', sa.Date(), nullable=True),
        sa.Column('acquisition_price', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),
        sa.Column('current_value', sa.Numeric(precision=14, scale=2), nullable=False, server_default='0'),

        # Common
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['category_id'], ['collection_categories.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_collection_items_account_id', 'collection_items', ['account_id'])
    op.create_index('ix_collection_items_category_id', 'collection_items', ['category_id'])

    # ── collection_price_history ─────────────────────────────────────────────
    op.create_table(
        'collection_price_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('valued_at', sa.Date(), nullable=False),
        sa.Column('value', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('note', sa.String(255), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['item_id'], ['collection_items.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_collection_price_history_item_id', 'collection_price_history', ['item_id'])
    op.create_index('ix_collection_price_history_account_id', 'collection_price_history', ['account_id'])

    # ── pokemon_cards (local mirror of pokemontcg.io data) ───────────────────
    op.create_table(
        'pokemon_cards',
        sa.Column('id', sa.String(50), nullable=False),          # e.g. "base1-4"
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('set_id', sa.String(50), nullable=False),
        sa.Column('set_name', sa.String(150), nullable=False),
        sa.Column('number', sa.String(20), nullable=False),
        sa.Column('rarity', sa.String(80), nullable=True),
        sa.Column('supertype', sa.String(30), nullable=True),    # Pokémon / Trainer / Energy
        sa.Column('image_url_small', sa.String(500), nullable=True),
        sa.Column('image_url_large', sa.String(500), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_pokemon_cards_name', 'pokemon_cards', ['name'])
    op.create_index('ix_pokemon_cards_set_id', 'pokemon_cards', ['set_id'])


def downgrade() -> None:
    op.drop_table('pokemon_cards')
    op.drop_table('collection_price_history')
    op.drop_table('collection_items')
    op.drop_table('collection_categories')
