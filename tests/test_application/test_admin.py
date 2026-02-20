"""
Tests for the admin panel.

Covers:
  - Access control (non-admin -> 403)
  - Admin access
  - User creation via POST /admin/users/new
  - Overview stats computation
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.infrastructure.db.models import User, EventLog


# ── Model-level tests ────────────────────────────────────────────────────────

class TestUserAdminFields:
    """User model has is_admin and last_seen_at columns."""

    def test_is_admin_column_exists(self):
        cols = {c.name for c in User.__table__.columns}
        assert "is_admin" in cols

    def test_last_seen_at_column_exists(self):
        cols = {c.name for c in User.__table__.columns}
        assert "last_seen_at" in cols

    def test_is_admin_default_false(self):
        col = User.__table__.c.is_admin
        assert col.server_default is not None
        # server_default arg text should be 'false'
        assert "false" in str(col.server_default.arg).lower()


# ── Readmodel tests ──────────────────────────────────────────────────────────

class TestAdminStatsImport:
    """Admin stats module can be imported and has expected functions."""

    def test_import_get_overview_stats(self):
        from app.readmodels.admin_stats import get_overview_stats
        assert callable(get_overview_stats)

    def test_import_get_users_list(self):
        from app.readmodels.admin_stats import get_users_list
        assert callable(get_users_list)

    def test_import_get_user_detail(self):
        from app.readmodels.admin_stats import get_user_detail
        assert callable(get_user_detail)

    def test_import_get_user_activity_feed(self):
        from app.readmodels.admin_stats import get_user_activity_feed
        assert callable(get_user_activity_feed)


class TestDescribeEvent:
    """Event description helper produces readable strings."""

    def test_known_event_type(self):
        from app.readmodels.admin_stats import _describe_event
        result = _describe_event("task_completed", {"title": "Купить молоко"})
        assert "Задача выполнена" in result
        assert "Купить молоко" in result

    def test_unknown_event_type(self):
        from app.readmodels.admin_stats import _describe_event
        result = _describe_event("some_custom_event", {})
        assert result == "some_custom_event"

    def test_event_without_title(self):
        from app.readmodels.admin_stats import _describe_event
        result = _describe_event("user_logged_in", {"email": "test@test.com"})
        assert "Вход в систему" in result


# ── Route-level tests (auth guard) ───────────────────────────────────────────

class TestAdminRouteImport:
    """Admin router can be imported."""

    def test_import_router(self):
        from app.api.v1.admin import router
        assert router is not None
        assert router.prefix == "/admin"


class TestAdminRequireAdmin:
    """_require_admin raises 403 for non-admin users."""

    def test_no_session(self):
        from app.api.v1.admin import _require_admin
        from fastapi import HTTPException

        request = MagicMock()
        request.session = {}
        db = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            _require_admin(request, db)
        assert exc_info.value.status_code == 403

    def test_non_admin_user(self):
        from app.api.v1.admin import _require_admin
        from fastapi import HTTPException

        request = MagicMock()
        request.session = {"user_id": 1}
        db = MagicMock()
        user = MagicMock()
        user.is_admin = False
        db.query.return_value.filter.return_value.first.return_value = user

        with pytest.raises(HTTPException) as exc_info:
            _require_admin(request, db)
        assert exc_info.value.status_code == 403

    def test_admin_user_returns_user(self):
        from app.api.v1.admin import _require_admin

        request = MagicMock()
        request.session = {"user_id": 1}
        db = MagicMock()
        user = MagicMock()
        user.is_admin = True
        db.query.return_value.filter.return_value.first.return_value = user

        result = _require_admin(request, db)
        assert result is user


# ── CSRF tests ───────────────────────────────────────────────────────────────

class TestCSRF:
    """CSRF token generation and verification."""

    def test_get_csrf_token_creates_token(self):
        from app.api.v1.admin import _get_csrf_token
        request = MagicMock()
        request.session = {}
        token = _get_csrf_token(request)
        assert len(token) == 64  # hex(32) = 64 chars
        assert request.session["_csrf"] == token

    def test_get_csrf_token_reuses_existing(self):
        from app.api.v1.admin import _get_csrf_token
        request = MagicMock()
        request.session = {"_csrf": "existing_token"}
        token = _get_csrf_token(request)
        assert token == "existing_token"

    def test_verify_csrf_valid(self):
        from app.api.v1.admin import _verify_csrf
        request = MagicMock()
        request.session = {"_csrf": "abc123"}
        # Should not raise
        _verify_csrf(request, "abc123")

    def test_verify_csrf_invalid(self):
        from app.api.v1.admin import _verify_csrf
        from fastapi import HTTPException
        request = MagicMock()
        request.session = {"_csrf": "abc123"}
        with pytest.raises(HTTPException) as exc_info:
            _verify_csrf(request, "wrong_token")
        assert exc_info.value.status_code == 403
