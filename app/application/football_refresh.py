"""
Daily job: fetch Zenit St. Petersburg fixtures from AllSportsAPI,
detect new matches and reschedules, create notifications for all users.

API: https://allsportsapi.com  (free tier 100 req/day)
Team lookup: GET ?action=get_teams&team_name=Zenit&APIkey={key}
Fixtures:    GET ?action=get_events&from=YYYY-MM-DD&to=YYYY-MM-DD&team_id={id}&APIkey={key}
"""
import logging
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from app.application.app_config import get_apifootball_key

logger = logging.getLogger(__name__)

API_BASE = "https://allsportsapi.com/api/football/"

STATUS_MAP = {
    "Finished":           "FT",
    "After Extra Time":   "AET",
    "After Penalties":    "PEN",
    "1H":  "1H",
    "2H":  "2H",
    "HT":  "HT",
    "ET":  "ET",
    "BT":  "BT",
    "P":   "P",
    "Postp.":  "PST",
    "Postponed": "PST",
    "Canc.":   "CANC",
    "Cancelled": "CANC",
    "ABD":     "ABD",
    "SUSP":    "SUSP",
    "Awarded": "AWD",
}

STATUS_LIVE     = {"1H", "HT", "2H", "ET", "BT", "P", "SUSP", "LIVE"}
STATUS_FINISHED = {"FT", "AET", "PEN", "AWD", "WO"}


# ── API helpers ───────────────────────────────────────────────────────────────

def _find_zenit_id(key: str) -> int | None:
    """Search for Zenit St. Petersburg team ID via AllSportsAPI."""
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(API_BASE, params={
                "action": "get_teams",
                "team_name": "Zenit",
                "APIkey": key,
            })
            r.raise_for_status()
            teams = r.json().get("result") or []
    except Exception as e:
        logger.warning("football_refresh: team lookup error — %s", e)
        return None

    for team in teams:
        name = (team.get("team_name") or "").lower()
        if "zenit" in name:
            try:
                return int(team["team_key"])
            except (KeyError, ValueError):
                pass
    logger.warning("football_refresh: Zenit not found in team search results")
    return None


def _fetch_fixtures(key: str, team_id: int) -> list[dict]:
    """Fetch fixtures for the past 30 days and the next 90 days in one request."""
    today = date.today()
    params = {
        "action":  "get_events",
        "from":    (today - timedelta(days=30)).isoformat(),
        "to":      (today + timedelta(days=90)).isoformat(),
        "team_id": team_id,
        "APIkey":  key,
    }
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(API_BASE, params=params)
            r.raise_for_status()
            return r.json().get("result") or []
    except Exception as e:
        logger.warning("football_refresh: fixtures fetch error — %s", e)
        return []


def _parse_score(result_str: str | None) -> tuple[int | None, int | None]:
    """Parse '2 - 1' or '2-1' → (home, away). Returns (None, None) on failure."""
    if not result_str:
        return None, None
    normalized = result_str.replace(" ", "")
    if normalized in ("-", "-:-", ""):
        return None, None
    parts = normalized.split("-")
    if len(parts) == 2:
        try:
            return int(parts[0]), int(parts[1])
        except ValueError:
            pass
    return None, None


def _parse_event(event: dict) -> dict | None:
    ext_id = event.get("event_key")
    if not ext_id:
        return None

    raw_date = event.get("event_date")
    if not raw_date:
        return None
    try:
        match_date = date.fromisoformat(str(raw_date)[:10])
    except ValueError:
        return None

    raw_time = event.get("event_time") or ""
    match_time = raw_time[:5] if raw_time else None  # "18:00:00" → "18:00"

    raw_status = event.get("event_status") or ""
    is_live = str(event.get("event_live", "0")) == "1"

    if is_live:
        status = "LIVE"
    elif raw_status == "Finished":
        status = "FT"
    else:
        status = STATUS_MAP.get(raw_status, "NS")

    score_home, score_away = _parse_score(event.get("event_final_result"))

    return {
        "external_id": int(ext_id),
        "match_date":  match_date,
        "match_time":  match_time,
        "home_team":   event.get("event_home_team", ""),
        "away_team":   event.get("event_away_team", ""),
        "competition": event.get("league_name", ""),
        "venue":       event.get("event_stadium") or None,
        "status":      status,
        "score_home":  score_home,
        "score_away":  score_away,
    }


# ── Notifications ─────────────────────────────────────────────────────────────

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
    for user in db.query(User).all():
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


# ── Main refresh ──────────────────────────────────────────────────────────────

def refresh_football_matches(db: Session) -> None:
    from app.infrastructure.db.models import FootballMatchModel
    from datetime import timezone as tz

    key = get_apifootball_key(db)
    if not key:
        return

    team_id = _find_zenit_id(key)
    if not team_id:
        logger.error("football_refresh: could not resolve Zenit team ID, aborting")
        return

    fixtures = _fetch_fixtures(key, team_id)
    now = datetime.now(tz.utc)

    for event in fixtures:
        parsed = _parse_event(event)
        if not parsed:
            continue

        ext_id = parsed["external_id"]
        existing = db.query(FootballMatchModel).filter_by(external_id=ext_id).first()

        if existing is None:
            match = FootballMatchModel(**parsed)
            db.add(match)
            db.flush()

            if parsed["match_date"] >= date.today() and parsed["status"] not in STATUS_FINISHED:
                label = _fmt_match_date(parsed["match_date"], parsed["match_time"])
                _notify_all_users(db, "FOOTBALL_MATCH_NEW", {
                    "home":        parsed["home_team"],
                    "away":        parsed["away_team"],
                    "date":        label,
                    "competition": parsed["competition"],
                }, match.id)
        else:
            rescheduled = (
                parsed["match_date"] != existing.match_date
                or parsed["match_time"] != existing.match_time
            )
            if rescheduled and parsed["status"] not in STATUS_FINISHED | STATUS_LIVE:
                _notify_all_users(db, "FOOTBALL_MATCH_RESCHEDULED", {
                    "home":     existing.home_team,
                    "away":     existing.away_team,
                    "old_date": _fmt_match_date(existing.match_date, existing.match_time),
                    "new_date": _fmt_match_date(parsed["match_date"], parsed["match_time"]),
                    "competition": existing.competition,
                }, existing.id)

            changed = False
            for field, val in parsed.items():
                if getattr(existing, field) != val:
                    setattr(existing, field, val)
                    changed = True
            if changed:
                existing.updated_at = now

    db.commit()
    logger.info("football_refresh: processed %d fixtures (team_id=%d)", len(fixtures), team_id)
