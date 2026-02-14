"""RecurrenceRule domain entity - generates events for recurrence rule operations"""
from datetime import datetime
from typing import Dict, Any


class RecurrenceRule:
    @staticmethod
    def create(
        account_id: int,
        rule_id: int,
        freq: str,
        interval: int,
        start_date: str,
        until_date: str | None = None,
        count: int | None = None,
        by_weekday: str | None = None,
        by_monthday: int | None = None,
        monthday_clip_to_last_day: bool = True,
        by_month: int | None = None,
        by_monthday_for_year: int | None = None,
        dates_json: str | None = None,
    ) -> Dict[str, Any]:
        return {
            "rule_id": rule_id,
            "account_id": account_id,
            "freq": freq,
            "interval": interval,
            "start_date": start_date,
            "until_date": until_date,
            "count": count,
            "by_weekday": by_weekday,
            "by_monthday": by_monthday,
            "monthday_clip_to_last_day": monthday_clip_to_last_day,
            "by_month": by_month,
            "by_monthday_for_year": by_monthday_for_year,
            "dates_json": dates_json,
            "created_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    def update(rule_id: int, **changes) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"rule_id": rule_id, "updated_at": datetime.utcnow().isoformat()}
        allowed = ("freq", "interval", "start_date", "until_date", "count",
                    "by_weekday", "by_monthday", "monthday_clip_to_last_day",
                    "by_month", "by_monthday_for_year", "dates_json")
        for key in allowed:
            if key in changes:
                payload[key] = changes[key]
        return payload
