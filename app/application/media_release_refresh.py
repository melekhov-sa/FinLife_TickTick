"""
Daily job: refresh release dates and episode counts from Kinopoisk for tracked
movie/series entries. Creates in-app + Telegram notifications on changes.
"""
import logging
from datetime import date

import httpx
from sqlalchemy.orm import Session

from app.application.app_config import get_kinopoisk_key

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pluralize_episodes(n: int) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return "серия"
    if 2 <= n % 10 <= 4 and not (12 <= n % 100 <= 14):
        return "серии"
    return "серий"


def _fmt_date(d: date) -> str:
    return d.strftime("%-d %b %Y").replace("Jan", "янв").replace("Feb", "фев") \
        .replace("Mar", "мар").replace("Apr", "апр").replace("May", "мая") \
        .replace("Jun", "июн").replace("Jul", "июл").replace("Aug", "авг") \
        .replace("Sep", "сен").replace("Oct", "окт").replace("Nov", "ноя") \
        .replace("Dec", "дек")


def _fetch_kp_details(kp_id: int, key: str) -> dict | None:
    url = f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}"
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(url, headers={"X-API-KEY": key})
            r.raise_for_status()
            return r.json()
    except Exception:
        return None


def _fetch_episodes_count(kp_id: int, key: str) -> int | None:
    """Return total episode count across all seasons, or None on error."""
    url = f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}/seasons"
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(url, headers={"X-API-KEY": key})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return None

    total = 0
    for season in data.get("items", []):
        episodes = season.get("episodes") or []
        # Count only episodes with a past/present air date
        today = date.today()
        for ep in episodes:
            raw = ep.get("releaseDate")
            if raw:
                try:
                    ep_date = date.fromisoformat(raw[:10])
                    if ep_date <= today:
                        total += 1
                except ValueError:
                    pass
    return total if total > 0 else None


def _get_channels(db: Session, user_id: int) -> list[str]:
    from app.infrastructure.db.models import UserNotificationSettings
    s = db.query(UserNotificationSettings).filter_by(user_id=user_id).first()
    channels = ["inapp"]
    if s and s.channels_json:
        for ch, on in s.channels_json.items():
            if on and ch != "inapp":
                channels.append(ch)
    return channels


def _notify(db: Session, user_id: int, entry_id: int, rule_code: str, ctx: dict, channels: list[str]) -> None:
    from app.application.notification_engine import _create_notification, _is_duplicate
    today = date.today()
    if _is_duplicate(db, user_id, rule_code, "media_entry", entry_id, today):
        return
    try:
        _create_notification(db, user_id, rule_code, "media_entry", entry_id, ctx, channels)
    except Exception:
        logger.exception("Failed to create %s notification for media_entry %s", rule_code, entry_id)
        db.rollback()


# ── Main refresh ──────────────────────────────────────────────────────────────

def refresh_media_release_dates(db: Session) -> None:
    from app.infrastructure.db.models import MediaEntryModel

    key = get_kinopoisk_key(db)
    if not key:
        return

    today = date.today()

    entries = (
        db.query(MediaEntryModel)
        .filter(
            MediaEntryModel.media_type.in_(["movie", "series"]),
            MediaEntryModel.kp_id.isnot(None),
            MediaEntryModel.status.in_(["want", "in_progress"]),
        )
        .all()
    )

    for entry in entries:
        channels = _get_channels(db, entry.account_id)

        # ── Release date refresh ──────────────────────────────────────────────
        # Skip movies that already have a confirmed past/present RU date
        if entry.release_date and entry.release_date <= today and entry.release_date_source == "ru":
            pass  # still check episodes for series below
        else:
            data = _fetch_kp_details(entry.kp_id, key)
            if data:
                def parse_date(s):
                    if not s:
                        return None
                    try:
                        return date.fromisoformat(s[:10])
                    except ValueError:
                        return None

                premiere_ru = parse_date(data.get("premiereRu"))
                premiere_world = parse_date(data.get("premiereWorld"))
                new_date = premiere_ru or premiere_world
                new_source = "ru" if premiere_ru else ("world" if premiere_world else None)

                if new_date and new_date != entry.release_date:
                    source_label = " (мировой прокат, даты в РФ пока нет)" if new_source == "world" else " (РФ)"
                    date_str = _fmt_date(new_date)

                    if entry.release_date is None:
                        # Date appeared for the first time
                        _notify(db, entry.account_id, entry.id, "MEDIA_DATE_APPEARED", {
                            "title": entry.title,
                            "date": date_str,
                            "source_label": source_label,
                        }, channels)
                    else:
                        # Date changed
                        _notify(db, entry.account_id, entry.id, "MEDIA_DATE_CHANGED", {
                            "title": entry.title,
                            "old_date": _fmt_date(entry.release_date),
                            "new_date": date_str,
                            "source_label": source_label,
                        }, channels)

                    entry.release_date = new_date
                    entry.release_date_source = new_source

        # ── Episode count refresh (series only) ───────────────────────────────
        if entry.media_type == "series":
            new_count = _fetch_episodes_count(entry.kp_id, key)
            if new_count is not None:
                old_count = entry.episodes_count or 0
                if new_count > old_count:
                    diff = new_count - old_count
                    _notify(db, entry.account_id, entry.id, "MEDIA_NEW_EPISODES", {
                        "title": entry.title,
                        "count": diff,
                        "episodes_word": _pluralize_episodes(diff),
                        "total": new_count,
                    }, channels)
                    entry.episodes_count = new_count

    db.commit()
    logger.info("media_release_refresh: processed %d entries", len(entries))
