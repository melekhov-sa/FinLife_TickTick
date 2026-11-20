"""
Один канал на уведомление.

Раньше об одном событии сообщали трижды: телеграмом, web-push'ем и бейджем
колокольчика. Теперь телеграм основной, push — запасной, а in-app запись
при доставке в телеграм помечается прочитанной: история остаётся, шума нет.
"""
from unittest.mock import patch

import pytest

from app.application.notify import VIA_NONE, VIA_PUSH, VIA_TELEGRAM, deliver
from app.infrastructure.telegram import TG_FAILED, TG_SENT, TG_SKIPPED

ACCT = 1
ARGS = dict(kind="task_reminder", title="Заголовок", body="Тело", url="/tasks")

TG = "app.application.notify.send_tg"
PUSH = "app.application.notify.send_push_to_user"


@pytest.mark.unit
def test_telegram_delivered_means_no_push(db_session):
    with patch(TG, return_value=TG_SENT), patch(PUSH) as push:
        assert deliver(db_session, ACCT, **ARGS) == VIA_TELEGRAM
    push.assert_not_called()


@pytest.mark.unit
def test_push_is_the_fallback_when_telegram_is_not_connected(db_session):
    with patch(TG, return_value=TG_SKIPPED), patch(PUSH, return_value=1) as push:
        assert deliver(db_session, ACCT, **ARGS) == VIA_PUSH
    push.assert_called_once()


@pytest.mark.unit
def test_push_is_the_fallback_when_telegram_fails(db_session):
    """Сломанный бот не должен означать молчание."""
    with patch(TG, return_value=TG_FAILED), patch(PUSH, return_value=1) as push:
        assert deliver(db_session, ACCT, **ARGS) == VIA_PUSH
    push.assert_called_once()


@pytest.mark.unit
def test_no_channel_available(db_session):
    with patch(TG, return_value=TG_SKIPPED), patch(PUSH, return_value=0):
        assert deliver(db_session, ACCT, **ARGS) == VIA_NONE


@pytest.mark.unit
def test_telegram_crash_does_not_block_push(db_session):
    with patch(TG, side_effect=RuntimeError("boom")), patch(PUSH, return_value=1) as push:
        assert deliver(db_session, ACCT, **ARGS) == VIA_PUSH
    push.assert_called_once()


@pytest.mark.unit
def test_push_crash_is_swallowed(db_session):
    with patch(TG, return_value=TG_SKIPPED), patch(PUSH, side_effect=RuntimeError("boom")):
        assert deliver(db_session, ACCT, **ARGS) == VIA_NONE
