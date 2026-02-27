"""
Background scheduler — runs periodic jobs inside the FastAPI process.

Jobs:
  - Morning digest (08:00 MSK / 05:00 UTC)
  - Evening digest (21:00 MSK / 18:00 UTC)
  - Reminder dispatcher (every 2 minutes)
  - Subscription notifications (09:00 MSK / 06:00 UTC)
  - Notification engine (09:30 MSK / 06:30 UTC)
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = BackgroundScheduler(daemon=True)


def _run_morning_digest():
    from app.infrastructure.db.session import get_session_factory
    from app.application.digest_service import send_morning_digest

    Session = get_session_factory()
    db = Session()
    try:
        send_morning_digest(db)
    except Exception:
        logger.exception("Morning digest job failed")
    finally:
        db.close()


def _run_evening_digest():
    from app.infrastructure.db.session import get_session_factory
    from app.application.digest_service import send_evening_digest

    Session = get_session_factory()
    db = Session()
    try:
        send_evening_digest(db)
    except Exception:
        logger.exception("Evening digest job failed")
    finally:
        db.close()


def _run_reminders():
    from app.infrastructure.db.session import get_session_factory
    from app.application.reminder_dispatcher import dispatch_due_reminders

    Session = get_session_factory()
    db = Session()
    try:
        dispatch_due_reminders(db)
    except Exception:
        logger.exception("Reminder dispatch job failed")
    finally:
        db.close()


def _run_subscription_notifications():
    from app.infrastructure.db.session import get_session_factory
    from app.application.subscription_notifications import check_subscription_notifications

    Session = get_session_factory()
    db = Session()
    try:
        check_subscription_notifications(db)
    except Exception:
        logger.exception("Subscription notifications job failed")
    finally:
        db.close()


def _run_notification_engine():
    from app.infrastructure.db.session import get_session_factory
    from app.application.notification_engine import NotificationEngine, dispatch_pending_deliveries

    Session = get_session_factory()
    db = Session()
    try:
        NotificationEngine(db).run()
        dispatch_pending_deliveries(db)
    except Exception:
        logger.exception("Notification engine job failed")
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler with all periodic jobs."""
    # Morning digest — 08:00 MSK (05:00 UTC)
    scheduler.add_job(
        _run_morning_digest,
        CronTrigger(hour=5, minute=0),
        id="morning_digest",
        replace_existing=True,
    )

    # Evening digest — 21:00 MSK (18:00 UTC)
    scheduler.add_job(
        _run_evening_digest,
        CronTrigger(hour=18, minute=0),
        id="evening_digest",
        replace_existing=True,
    )

    # Reminder dispatcher — every 2 minutes
    scheduler.add_job(
        _run_reminders,
        "interval",
        minutes=2,
        id="reminders",
        replace_existing=True,
    )

    # Subscription expiration notifications — 09:00 MSK (06:00 UTC)
    scheduler.add_job(
        _run_subscription_notifications,
        CronTrigger(hour=6, minute=0),
        id="subscription_notifications",
        replace_existing=True,
    )

    # Notification engine — 09:30 MSK (06:30 UTC)
    scheduler.add_job(
        _run_notification_engine,
        CronTrigger(hour=6, minute=30),
        id="notification_engine",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "Scheduler started: morning_digest (05:00 UTC), evening_digest (18:00 UTC), "
        "reminders (every 2 min), sub_notifications (06:00 UTC), notification_engine (06:30 UTC)"
    )


def shutdown_scheduler():
    """Gracefully stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
