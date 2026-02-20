"""
Tests for Web Push subscription and notification infrastructure.
"""
from unittest.mock import MagicMock, patch

from app.config import Settings
from app.infrastructure.db.models import PushSubscription


class TestPushSettings:
    """VAPID settings in config."""

    def test_defaults_empty(self):
        # _env_file=None prevents reading from .env
        s = Settings(DATABASE_URL="sqlite:///:memory:", _env_file=None)
        assert s.VAPID_PUBLIC_KEY == ""
        assert s.VAPID_PRIVATE_KEY == ""
        assert s.VAPID_MAILTO == "mailto:admin@finlife.app"

    def test_custom_values(self):
        s = Settings(
            DATABASE_URL="sqlite:///:memory:",
            VAPID_PUBLIC_KEY="BTestKey123",
            VAPID_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
            VAPID_MAILTO="mailto:test@example.com",
            _env_file=None,
        )
        assert s.VAPID_PUBLIC_KEY == "BTestKey123"
        assert "PRIVATE KEY" in s.VAPID_PRIVATE_KEY
        assert s.VAPID_MAILTO == "mailto:test@example.com"


class TestPushSubscriptionModel:
    """PushSubscription model structure."""

    def test_tablename(self):
        assert PushSubscription.__tablename__ == "push_subscriptions"

    def test_columns_exist(self):
        cols = {c.name for c in PushSubscription.__table__.columns}
        assert "id" in cols
        assert "user_id" in cols
        assert "endpoint" in cols
        assert "p256dh" in cols
        assert "auth" in cols
        assert "created_at" in cols

    def test_endpoint_unique(self):
        endpoint_col = PushSubscription.__table__.c.endpoint
        assert endpoint_col.unique is True


class TestPushServiceImport:
    """Push service can be imported and has correct functions."""

    def test_import_send_web_push(self):
        from app.application.push_service import send_web_push
        assert callable(send_web_push)

    def test_import_send_push_to_user(self):
        from app.application.push_service import send_push_to_user
        assert callable(send_push_to_user)

    def test_send_web_push_returns_false_without_keys(self):
        """Without VAPID keys, push returns False immediately."""
        from app.application.push_service import send_web_push

        db = MagicMock()
        sub = MagicMock()
        sub.endpoint = "https://example.com/push/abc"
        sub.p256dh = "test_p256dh"
        sub.auth = "test_auth"

        empty_settings = Settings(
            DATABASE_URL="sqlite:///:memory:",
            VAPID_PUBLIC_KEY="",
            VAPID_PRIVATE_KEY="",
            _env_file=None,
        )
        with patch("app.application.push_service.get_settings", return_value=empty_settings):
            result = send_web_push(db, sub, {"title": "test", "body": "test"})
        assert result is False


class TestReminderDispatcherImport:
    """Reminder dispatcher can be imported."""

    def test_import(self):
        from app.application.reminder_dispatcher import dispatch_due_reminders
        assert callable(dispatch_due_reminders)
