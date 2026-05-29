"""
Daily job: fetch Zenit St. Petersburg fixtures from api-football.com,
detect new matches and reschedules, create notifications for all users.

API: https://v3.api-football.com  (api-sports.io, free tier 100 req/day)
Zenit team ID: 1020
"""
import logging
from datetime import date, datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.application.app_config import get_apifootball_key

logger = logging.getLogger(__name__)

ZENIT_TEAM_ID = 1020
API_BASE = "https://v3.api-football.com"

STATUS_LIVE = {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"}
STATUS_FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}


def _fetch_fixtures(key: str) -> list[dict]:
    """Fetch next 30 upcoming fixtures + last 10 for Zenit."""
    headers = {"x-apisports-key": key}
    results = []
    for params in [
        {"team": ZENIT_TEAM_ID, "next": 30},
        {"team": ZENIT_TEAM_ID, "last": 10},
    ]:
        try:
            with httpx.Client(timeout=10) as client:
                r = client.get(f"{API_BASE}/fixtures", headers=headers, params=params)
                r.raise_for_status()
                data = r.json()
                results.extend(data.get("response", []))
        except Exception as e:
            logger.warning("football_refresh: fetch error %s", e)
    return results


def _parse_fixture(item: dict) -> dict | None:
    fixture = item.get("fixture", {})
    teams = item.get("teams", {})
    league = item.get("league", {})
    goals = item.get("goals", {})

    ext_id = fixture.get("id")
    if not ext_id:
        return None

    raw_date = fixture.get("date")  # "2026-04-15T17:00:00+03:00"
    if not raw_date:
        return None
    try:
        dt = datetime.fromisoformat(raw_date)
        match_date = dt.date()
        match_time = dt.strftime("%H:%M")
    except ValueError:
        return None

    status = fixture.get("status", {}).get("short", "NS")
    venue_obj = fixture.get("venue") or {}

    return {
        "external_id": ext_id,
        "match_date": match_date,
        "match_time": match_time,
        "home_team": teams.get("home", {}).get("name", ""),
        "away_team": teams.get("away", {}).get("name", ""),
        "competition": league.get("name", ""),
        "venue": venue_obj.get("name"),
        "status": status,
        "score_home": goals.get("home"),
        "score_away": goals.get("away"),
    }


def _fmt_match_date(d: date, t: str | None) -> str:
    months = ["янв", "фев", "мар", "апр", "мая", "июн",
              "июл", "авг", "сен", "окт", "ноя", "дек"]
    label = f"{d.day} {months[d.month - 1]}"
    if t:
        label += f" в {t}"
    return label


def _notify_all_users(db: Session, rule_code: str, ctx: dict, entity_id: int) -> None:
    from app.infrastructure.db.models import User, UserNotificationSettings
    from app.application.notification_engine import _create_notification, _is_duplicate

    today = date.today()
    users = db.query(User).all()
    for user in users:
        if _is_duplicate(db, user.id, rule_code, "football_match", entity_id, today):
            continue
        settings = db.query(UserNotificationSettings).filter_by(user_id=user.id).first()
        channels = ["inapp"]
        if settings and settings.channels_json:
            for ch, on in settings.channels_json.items():
                if on and ch != "inapp":
                    channels.append(ch)
        try:
            _create_notification(db, user.id, rule_code, "football_match", entity_id, ctx, channels)
        except Exception:
            logger.exception("football notify failed user=%s rule=%s", user.id, rule_code)
            db.rollback()


def refresh_football_matches(db: Session) -> None:
    from app.infrastructure.db.models import FootballMatchModel
    from datetime import timezone as tz

    key = get_apifootball_key(db)
    if not key:
        return

    fixtures = _fetch_fixtures(key)
    now = datetime.now(tz.utc)

    for item in fixtures:
        parsed = _parse_fixture(item)
        if not parsed:
            continue

        ext_id = parsed["external_id"]
        existing = db.query(FootballMatchModel).filter_by(external_id=ext_id).first()

        if existing is None:
            # New match — save and notify (only for upcoming)
            match = FootballMatchModel(**parsed)
            db.add(match)
            db.flush()

            if parsed["match_date"] >= date.today() and parsed["status"] not in STATUS_FINISHED:
                label = _fmt_match_date(parsed["match_date"], parsed["match_time"])
                home, away = parsed["home_team"], parsed["away_team"]
                _notify_all_users(db, "FOOTBALL_MATCH_NEW", {
                    "home": home, "away": away,
                    "date": label,
                    "competition": parsed["competition"],
                }, match.id)
        else:
            changed = False
            rescheduled = (
                parsed["match_date"] != existing.match_date
                or parsed["match_time"] != existing.match_time
            )

            if rescheduled and parsed["status"] not in STATUS_FINISHED | STATUS_LIVE:
                old_label = _fmt_match_date(existing.match_date, existing.match_time)
                new_label = _fmt_match_date(parsed["match_date"], parsed["match_time"])
                _notify_all_users(db, "FOOTBALL_MATCH_RESCHEDULED", {
                    "home": existing.home_team,
                    "away": existing.away_team,
                    "old_date": old_label,
                    "new_date": new_label,
                    "competition": existing.competition,
                }, existing.id)

            for field, val in parsed.items():
                if getattr(existing, field) != val:
                    setattr(existing, field, val)
                    changed = True
            if changed:
                existing.updated_at = now

    db.commit()
    logger.info("football_refresh: processed %d fixtures", len(fixtures))
