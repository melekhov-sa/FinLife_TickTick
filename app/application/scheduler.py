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


def _run_weekly_digest_job():
    """Sunday 18:00 MSK (15:00 UTC) — generate weekly digests for all users."""
    from app.infrastructure.db.session import get_session_factory
    from app.application.digests import generate_and_save_weekly_digest, iso_week_key
    from datetime import date, timedelta

    Session = get_session_factory()
    db = Session()
    try:
        from app.infrastructure.db.models import User
        users = db.query(User).all()
        # The week that just ended is the previous Monday-Sunday
        today = date.today()  # Sunday
        # week_start = today - 6 days (back to Monday)
        week_start = today - timedelta(days=6)
        week_key = iso_week_key(week_start)
        for user in users:
            try:
                from app.infrastructure.db.models import DigestModel
                existing = (
                    db.query(DigestModel)
                    .filter(
                        DigestModel.account_id == user.id,
                        DigestModel.period_type == "week",
                        DigestModel.period_key == week_key,
                    )
                    .first()
                )
                if not existing:
                    generate_and_save_weekly_digest(db, user.id, week_start)
                    logger.info("Generated weekly digest %s for user_id=%s", week_key, user.id)
            except Exception:
                logger.exception("Weekly digest generation failed for user_id=%s", user.id)
    except Exception:
        logger.exception("Weekly digest job failed")
    finally:
        db.close()


def start_scheduler():
    """Start the background scheduler with all periodic jobs."""
    from app.config import get_settings
    if get_settings().DISABLE_NOTIFICATIONS:
        logger.info("DISABLE_NOTIFICATIONS=True — skipping notification scheduler jobs")
        scheduler.start()
        return
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

    # Weekly digest — Sunday 18:00 MSK (15:00 UTC)
    scheduler.add_job(
        _run_weekly_digest_job,
        CronTrigger(day_of_week="sun", hour=15, minute=0),  # 18:00 MSK
        id="weekly_digest",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "Scheduler started: morning_digest (05:00 UTC), evening_digest (18:00 UTC), "
        "reminders (every 2 min), sub_notifications (06:00 UTC), notification_engine (06:30 UTC), "
        "weekly_digest (Sun 15:00 UTC)"
    )


def shutdown_scheduler():
    """Gracefully stop the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
