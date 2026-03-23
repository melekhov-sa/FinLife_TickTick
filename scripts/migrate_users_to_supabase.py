"""
Migrate existing local users to Supabase Auth.

For users with fake/non-existent emails, specify EMAIL_REMAP below
to use a real email in Supabase AND update it in the local DB.

Usage:
    python scripts/migrate_users_to_supabase.py
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import get_settings
from app.infrastructure.db.session import get_session_factory
SessionLocal = get_session_factory()
from app.infrastructure.db.models import User
from supabase import create_client

# ── Настройте здесь ───────────────────────────────────────────────────────────
# Замените несуществующие email на реальные.
# Формат: "старый_email": "новый_реальный_email"
EMAIL_REMAP = {
    # пусто — все email в БД уже реальные
}

# Способ входа после миграции:
#   "magic_link" — пользователь получает письмо со ссылкой, кликает и сразу входит (пароль не нужен)
#   "recovery"   — пользователь получает письмо для установки нового пароля
INVITE_METHOD = "magic_link"
# ─────────────────────────────────────────────────────────────────────────────


def main():
    settings = get_settings()

    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
        sys.exit(1)

    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    db = SessionLocal()  # type: ignore
    try:
        users = db.query(User).all()
        print(f"Found {len(users)} users in local DB\n")

        for user in users:
            original_email = user.email
            target_email = EMAIL_REMAP.get(original_email, original_email)

            if target_email != original_email:
                print(f"Remapping: {original_email} → {target_email}")

            print(f"Migrating: {target_email} ...", end=" ")
            try:
                # Create user in Supabase (email already confirmed)
                response = client.auth.admin.create_user({
                    "email": target_email,
                    "email_confirm": True,
                })
                supabase_uid = response.user.id
                print(f"created (uid={supabase_uid})")

                # Update local DB email if remapped
                if target_email != original_email:
                    user.email = target_email
                    db.commit()
                    print(f"  → local DB email updated to {target_email}")

                # Send login link
                link_response = client.auth.admin.generate_link({
                    "type": INVITE_METHOD,
                    "email": target_email,
                })
                action_link = link_response.properties.action_link
                verb = "magic link" if INVITE_METHOD == "magic_link" else "password reset link"
                print(f"  → {verb}: {action_link}")

            except Exception as e:
                err = str(e)
                if "already been registered" in err or "already exists" in err:
                    print("already exists in Supabase — skipped")
                else:
                    print(f"ERROR: {e}")

        print("\nMigration complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
