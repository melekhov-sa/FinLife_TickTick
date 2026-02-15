"""create contacts table and refactor subscription_members

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-02-14
"""
from alembic import op
import sqlalchemy as sa


revision = 'k6l7m8n9o0p1'
down_revision = 'j5k6l7m8n9o0'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Create contacts table
    op.create_table(
        'contacts',
        sa.Column('id', sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_contacts_account_id', 'contacts', ['account_id'])

    # 2. Add contact_id to subscription_members (temporarily nullable)
    op.add_column(
        'subscription_members',
        sa.Column('contact_id', sa.Integer(), nullable=True),
    )
    op.create_index('ix_subscription_members_contact_id', 'subscription_members', ['contact_id'])

    # 3. Data migration: create contacts from existing members
    conn = op.get_bind()

    # Get distinct (account_id, name) from subscription_members
    rows = conn.execute(
        sa.text("SELECT DISTINCT account_id, name FROM subscription_members")
    ).fetchall()

    for row in rows:
        account_id, name = row[0], row[1]
        # Insert contact
        result = conn.execute(
            sa.text("INSERT INTO contacts (account_id, name) VALUES (:aid, :n) RETURNING id"),
            {"aid": account_id, "n": name},
        )
        contact_id = result.fetchone()[0]

        # Update subscription_members with this contact_id
        conn.execute(
            sa.text(
                "UPDATE subscription_members SET contact_id = :cid "
                "WHERE account_id = :aid AND name = :n"
            ),
            {"cid": contact_id, "aid": account_id, "n": name},
        )

    # 4. Make contact_id NOT NULL
    op.alter_column('subscription_members', 'contact_id', nullable=False)

    # 5. Drop name, note from subscription_members
    op.drop_column('subscription_members', 'name')
    op.drop_column('subscription_members', 'note')


def downgrade():
    # Re-add name, note columns
    op.add_column(
        'subscription_members',
        sa.Column('name', sa.String(255), nullable=True),
    )
    op.add_column(
        'subscription_members',
        sa.Column('note', sa.Text(), nullable=True),
    )

    # Migrate names back from contacts
    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE subscription_members sm SET name = c.name, note = c.note "
            "FROM contacts c WHERE sm.contact_id = c.id"
        )
    )

    op.alter_column('subscription_members', 'name', nullable=False)

    # Drop contact_id
    op.drop_index('ix_subscription_members_contact_id', 'subscription_members')
    op.drop_column('subscription_members', 'contact_id')

    # Drop contacts table
    op.drop_index('ix_contacts_account_id', 'contacts')
    op.drop_table('contacts')
