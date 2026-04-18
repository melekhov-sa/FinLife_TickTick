"""
Tests for digest_service.py — commit-before-send dedup via DigestDispatchLog.
"""
import pytest
from datetime import date
from unittest.mock import patch, MagicMock

from app.infrastructure.db.models import User, PushSubscription, DigestDispatchLog


TODAY = date(2026, 4, 18)
USER_ID = 1


def _user(db, user_id=USER_ID) -> User:
    u = db.query(User).filter_by(id=user_id).first()
    if not u:
        u = User(
            id=user_id,
            email=f"test{user_id}@example.com",
            password_hash="x",
            digest_morning=True,
            digest_evening=True,
        )
        db.add(u)
        db.flush()
    return u


def _push_sub(db, user_id=USER_ID):
    sub = PushSubscription(
        user_id=user_id,
        endpoint="https://push.example.com/sub1",
        p256dh="key",
        auth="auth",
    )
    db.add(sub)
    db.flush()
    return sub


class TestDigestServiceDedup:
    def test_morning_digest_sent_only_once(self, db_session):
        """
        Calling send_morning_digest twice on the same day for the same user
        should invoke the push helper exactly once.
        """
        _user(db_session)
        _push_sub(db_session)

        with patch("app.application.digest_service.OccurrenceGenerator") as mock_gen, \
             patch("app.application.digest_service.DashboardService") as mock_dash, \
             patch("app.application.digest_service.send_push_to_user") as mock_push, \
             patch("app.application.digest_service.date") as mock_date:

            mock_date.today.return_value = TODAY

            mock_gen.return_value.generate_all.return_value = {}
            mock_dash.return_value.get_today_block.return_value = {
                "active": [],
                "overdue": [],
                "progress": {"total": 0, "done": 0, "left": 0},
            }
            mock_push.return_value = 1

            from app.application.digest_service import send_morning_digest

            send_morning_digest(db_session)
            send_morning_digest(db_session)

        # Push must have been called exactly once
        assert mock_push.call_count == 1

    def test_evening_digest_sent_only_once(self, db_session):
        """
        Calling send_evening_digest twice on the same day should push exactly once.
        """
        _user(db_session)
        _push_sub(db_session)

        with patch("app.application.digest_service.DashboardService") as mock_dash, \
             patch("app.application.digest_service.send_push_to_user") as mock_push, \
             patch("app.application.digest_service.date") as mock_date:

            mock_date.today.return_value = TODAY

            mock_dash.return_value.get_today_block.return_value = {
                "active": [],
                "overdue": [],
                "progress": {"total": 3, "done": 2, "left": 1},
            }
            mock_push.return_value = 1

            from app.application.digest_service import send_evening_digest

            send_evening_digest(db_session)
            send_evening_digest(db_session)

        assert mock_push.call_count == 1

    def test_morning_and_evening_both_succeed_same_day(self, db_session):
        """
        Morning and evening digests use different `kind` values — both must go through
        on the same day for the same user.
        """
        _user(db_session)
        _push_sub(db_session)

        with patch("app.application.digest_service.OccurrenceGenerator") as mock_gen, \
             patch("app.application.digest_service.DashboardService") as mock_dash, \
             patch("app.application.digest_service.send_push_to_user") as mock_push, \
             patch("app.application.digest_service.date") as mock_date:

            mock_date.today.return_value = TODAY

            mock_gen.return_value.generate_all.return_value = {}
            mock_dash.return_value.get_today_block.return_value = {
                "active": [],
                "overdue": [],
                "progress": {"total": 2, "done": 1, "left": 1},
            }
            mock_push.return_value = 1

            from app.application.digest_service import send_morning_digest, send_evening_digest

            send_morning_digest(db_session)
            send_evening_digest(db_session)

        # Both morning and evening should have fired push once each
        assert mock_push.call_count == 2

    def test_dispatch_log_row_created(self, db_session):
        """
        After send_morning_digest, a DigestDispatchLog row must exist with kind='morning'.
        """
        _user(db_session)
        _push_sub(db_session)

        with patch("app.application.digest_service.OccurrenceGenerator") as mock_gen, \
             patch("app.application.digest_service.DashboardService") as mock_dash, \
             patch("app.application.digest_service.send_push_to_user") as mock_push, \
             patch("app.application.digest_service.date") as mock_date:

            mock_date.today.return_value = TODAY
            mock_gen.return_value.generate_all.return_value = {}
            mock_dash.return_value.get_today_block.return_value = {
                "active": [],
                "overdue": [],
                "progress": {"total": 0, "done": 0, "left": 0},
            }
            mock_push.return_value = 0

            from app.application.digest_service import send_morning_digest
            send_morning_digest(db_session)

        row = db_session.query(DigestDispatchLog).filter_by(
            user_id=USER_ID, kind="morning", sent_date=TODAY
        ).first()
        assert row is not None
