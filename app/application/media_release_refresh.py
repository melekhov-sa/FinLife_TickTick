"""
Daily job: refresh release dates from Kinopoisk for movie/series entries
that have a kp_id but no release_date (or a future release_date that may have been updated).
"""
import logging
from datetime import date

import httpx
from sqlalchemy.orm import Session

from app.application.app_config import get_kinopoisk_key

logger = logging.getLogger(__name__)


def _fetch_premiere(kp_id: int, key: str) -> date | None:
    url = f"https://kinopoiskapiunofficial.tech/api/v2.2/films/{kp_id}"
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(url, headers={"X-API-KEY": key})
            r.raise_for_status()
            data = r.json()
    except Exception:
        return None

    for field in ("premiereRu", "premiereWorld"):
        raw = data.get(field)
        if raw:
            try:
                return date.fromisoformat(raw[:10])
            except ValueError:
                pass
    return None


def refresh_media_release_dates(db: Session) -> None:
    from app.infrastructure.db.models import MediaEntryModel

    key = get_kinopoisk_key(db)
    if not key:
        return

    today = date.today()

    # Refresh entries with kp_id that have no date OR a future date (may have changed)
    entries = (
        db.query(MediaEntryModel)
        .filter(
            MediaEntryModel.media_type.in_(["movie", "series"]),
            MediaEntryModel.kp_id.isnot(None),
            MediaEntryModel.status.in_(["want", "in_progress"]),
        )
        .all()
    )

    updated = 0
    for entry in entries:
        # Skip if already has a past/present date (already released)
        if entry.release_date and entry.release_date <= today:
            continue
        new_date = _fetch_premiere(entry.kp_id, key)
        if new_date and new_date != entry.release_date:
            entry.release_date = new_date
            updated += 1

    if updated:
        db.commit()
        logger.info("media_release_refresh: updated %d entries", updated)
