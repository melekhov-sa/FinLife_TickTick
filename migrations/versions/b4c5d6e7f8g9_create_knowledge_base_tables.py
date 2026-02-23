"""create knowledge base tables

Revision ID: b4c5d6e7f8g9
Revises: a1b2c3d4e5f6
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "b4c5d6e7f8g9"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- articles --
    op.create_table(
        "articles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content_md", sa.Text(), server_default="", nullable=False),
        sa.Column("type", sa.String(20), server_default="note", nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_articles_account_id", "articles", ["account_id"])
    op.create_index("ix_articles_status", "articles", ["status"])
    op.create_index("ix_articles_type", "articles", ["type"])

    # GIN full-text indexes (PostgreSQL only)
    op.execute(
        "CREATE INDEX ix_articles_title_fts "
        "ON articles USING gin (to_tsvector('russian', title))"
    )
    op.execute(
        "CREATE INDEX ix_articles_content_fts "
        "ON articles USING gin (to_tsvector('russian', content_md))"
    )

    # -- tags --
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("account_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "name", name="uq_tag_account_name"),
    )
    op.create_index("ix_tags_account_id", "tags", ["account_id"])

    # -- article_tags --
    op.create_table(
        "article_tags",
        sa.Column(
            "article_id", sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "tag_id", sa.Integer(),
            sa.ForeignKey("tags.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("article_id", "tag_id"),
    )

    # -- article_links --
    op.create_table(
        "article_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "article_id", sa.Integer(),
            sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("entity_type", sa.String(30), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_article_links_article_id", "article_links", ["article_id"])
    op.create_index("ix_article_links_entity", "article_links", ["entity_type", "entity_id"])


def downgrade() -> None:
    op.drop_index("ix_article_links_entity", table_name="article_links")
    op.drop_index("ix_article_links_article_id", table_name="article_links")
    op.drop_table("article_links")
    op.drop_table("article_tags")
    op.drop_index("ix_tags_account_id", table_name="tags")
    op.drop_table("tags")
    op.execute("DROP INDEX IF EXISTS ix_articles_content_fts")
    op.execute("DROP INDEX IF EXISTS ix_articles_title_fts")
    op.drop_index("ix_articles_type", table_name="articles")
    op.drop_index("ix_articles_status", table_name="articles")
    op.drop_index("ix_articles_account_id", table_name="articles")
    op.drop_table("articles")
