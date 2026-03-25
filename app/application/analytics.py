"""
Analytics service — read-only aggregations over transactions_feed.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import func, extract, case, literal_column
from sqlalchemy.orm import Session

from app.infrastructure.db.models import TransactionFeed, CategoryInfo


class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    # ── Monthly trend (last N months) ────────────────────────────────────────

    def get_monthly_trend(
        self, account_id: int, currency: str, months: int = 12, today: date | None = None,
    ) -> list[dict]:
        """Return [{month: 'YYYY-MM', income: float, expense: float, net: float}, ...]"""
        if today is None:
            today = date.today()

        # Build start date: first day N months ago
        y, m = today.year, today.month
        for _ in range(months - 1):
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        start = datetime(y, m, 1)

        rows = (
            self.db.query(
                func.to_char(TransactionFeed.occurred_at, "YYYY-MM").label("month"),
                TransactionFeed.operation_type,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
                TransactionFeed.occurred_at >= start,
            )
            .group_by("month", TransactionFeed.operation_type)
            .all()
        )

        # Build month list
        month_keys = []
        cy, cm = y, m
        for _ in range(months):
            month_keys.append(f"{cy:04d}-{cm:02d}")
            cm += 1
            if cm > 12:
                cm, cy = 1, cy + 1

        data_map: dict[str, dict] = {mk: {"income": 0, "expense": 0} for mk in month_keys}
        for row in rows:
            mk = row.month
            if mk in data_map:
                if row.operation_type == "INCOME":
                    data_map[mk]["income"] = float(row.total or 0)
                else:
                    data_map[mk]["expense"] = float(row.total or 0)

        return [
            {
                "month": mk,
                "income": d["income"],
                "expense": d["expense"],
                "net": round(d["income"] - d["expense"], 2),
            }
            for mk, d in data_map.items()
        ]

    # ── Category breakdown for a period ──────────────────────────────────────

    def get_category_breakdown(
        self, account_id: int, currency: str, op_type: str, period: str,
    ) -> list[dict]:
        """
        Return [{category_id, category_name, parent_name, amount, percent}, ...] sorted by amount DESC.
        period = 'YYYY-MM'
        """
        year, month = int(period[:4]), int(period[5:7])
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)

        rows = (
            self.db.query(
                TransactionFeed.category_id,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type == op_type,
                TransactionFeed.occurred_at >= start,
                TransactionFeed.occurred_at < end,
            )
            .group_by(TransactionFeed.category_id)
            .all()
        )

        if not rows:
            return []

        # Load categories for this account
        cats = {
            c.category_id: c
            for c in self.db.query(CategoryInfo).filter(CategoryInfo.account_id == account_id).all()
        }

        grand_total = sum(float(r.total or 0) for r in rows)
        items = []
        # Aggregate by parent category
        parent_totals: dict[str, float] = {}
        parent_ids: dict[str, int | None] = {}

        for r in rows:
            amount = float(r.total or 0)
            cat = cats.get(r.category_id)
            if cat and cat.parent_id:
                parent = cats.get(cat.parent_id)
                parent_name = parent.title if parent else "Другое"
                pid = cat.parent_id
            elif cat:
                parent_name = cat.title
                pid = cat.category_id
            else:
                parent_name = "Без категории"
                pid = None

            parent_totals[parent_name] = parent_totals.get(parent_name, 0) + amount
            parent_ids[parent_name] = pid

        for name, total in sorted(parent_totals.items(), key=lambda x: -x[1]):
            items.append({
                "category_name": name,
                "category_id": parent_ids.get(name),
                "amount": round(total, 2),
                "percent": round(total / grand_total * 100, 1) if grand_total else 0,
            })

        return items

    # ── Daily spending for a month ───────────────────────────────────────────

    def get_daily_spending(
        self, account_id: int, currency: str, period: str,
    ) -> list[dict]:
        """Return [{day: 'YYYY-MM-DD', income: float, expense: float}, ...] for every day in month."""
        year, month = int(period[:4]), int(period[5:7])
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)

        rows = (
            self.db.query(
                func.date(TransactionFeed.occurred_at).label("day"),
                TransactionFeed.operation_type,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]),
                TransactionFeed.occurred_at >= start,
                TransactionFeed.occurred_at < end,
            )
            .group_by("day", TransactionFeed.operation_type)
            .all()
        )

        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        data: dict[str, dict] = {}
        for d in range(1, days_in_month + 1):
            key = f"{year:04d}-{month:02d}-{d:02d}"
            data[key] = {"income": 0, "expense": 0}

        for r in rows:
            key = str(r.day)
            if key in data:
                if r.operation_type == "INCOME":
                    data[key]["income"] = float(r.total or 0)
                else:
                    data[key]["expense"] = float(r.total or 0)

        return [
            {"day": k, "income": v["income"], "expense": v["expense"]}
            for k, v in sorted(data.items())
        ]

    # ── Summary stats for a period ───────────────────────────────────────────

    def get_period_summary(
        self, account_id: int, currency: str, period: str,
    ) -> dict:
        """
        Return summary for a month: income, expense, net, savings_rate,
        avg_daily_expense, transaction_count, top_expense_day.
        """
        year, month = int(period[:4]), int(period[5:7])
        start = datetime(year, month, 1)
        if month == 12:
            end = datetime(year + 1, 1, 1)
        else:
            end = datetime(year, month + 1, 1)

        base = [
            TransactionFeed.account_id == account_id,
            TransactionFeed.currency == currency,
            TransactionFeed.occurred_at >= start,
            TransactionFeed.occurred_at < end,
        ]

        income = float(
            self.db.query(func.coalesce(func.sum(TransactionFeed.amount), 0))
            .filter(*base, TransactionFeed.operation_type == "INCOME")
            .scalar() or 0
        )
        expense = float(
            self.db.query(func.coalesce(func.sum(TransactionFeed.amount), 0))
            .filter(*base, TransactionFeed.operation_type == "EXPENSE")
            .scalar() or 0
        )
        tx_count = (
            self.db.query(func.count())
            .filter(*base, TransactionFeed.operation_type.in_(["INCOME", "EXPENSE"]))
            .scalar() or 0
        )

        # Previous month for comparison
        pm, py = month - 1, year
        if pm == 0:
            pm, py = 12, year - 1
        prev_start = datetime(py, pm, 1)
        prev_income = float(
            self.db.query(func.coalesce(func.sum(TransactionFeed.amount), 0))
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type == "INCOME",
                TransactionFeed.occurred_at >= prev_start,
                TransactionFeed.occurred_at < start,
            ).scalar() or 0
        )
        prev_expense = float(
            self.db.query(func.coalesce(func.sum(TransactionFeed.amount), 0))
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type == "EXPENSE",
                TransactionFeed.occurred_at >= prev_start,
                TransactionFeed.occurred_at < start,
            ).scalar() or 0
        )

        import calendar
        days_in_month = calendar.monthrange(year, month)[1]
        # How many days have passed (for avg)
        if year == date.today().year and month == date.today().month:
            days_elapsed = date.today().day
        else:
            days_elapsed = days_in_month

        net = round(income - expense, 2)
        savings_rate = round((income - expense) / income * 100, 1) if income > 0 else 0

        return {
            "income": round(income, 2),
            "expense": round(expense, 2),
            "net": net,
            "savings_rate": savings_rate,
            "avg_daily_expense": round(expense / max(days_elapsed, 1), 2),
            "transaction_count": tx_count,
            "prev_income": round(prev_income, 2),
            "prev_expense": round(prev_expense, 2),
            "income_delta": round(income - prev_income, 2),
            "expense_delta": round(expense - prev_expense, 2),
        }

    # ── Category trend (top categories over months) ──────────────────────────

    def get_category_trend(
        self, account_id: int, currency: str, op_type: str, months: int = 6, today: date | None = None,
    ) -> dict:
        """
        Return {categories: [name, ...], months: [YYYY-MM, ...], series: {name: [val, ...], ...}}
        for top 5 categories over last N months.
        """
        if today is None:
            today = date.today()

        y, m = today.year, today.month
        month_keys = []
        for _ in range(months):
            month_keys.append(f"{y:04d}-{m:02d}")
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        month_keys.reverse()
        start_y, start_m = int(month_keys[0][:4]), int(month_keys[0][5:7])
        start = datetime(start_y, start_m, 1)

        rows = (
            self.db.query(
                func.to_char(TransactionFeed.occurred_at, "YYYY-MM").label("month"),
                TransactionFeed.category_id,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.currency == currency,
                TransactionFeed.operation_type == op_type,
                TransactionFeed.occurred_at >= start,
            )
            .group_by("month", TransactionFeed.category_id)
            .all()
        )

        cats = {
            c.category_id: c
            for c in self.db.query(CategoryInfo).filter(CategoryInfo.account_id == account_id).all()
        }

        # Roll up to parent
        parent_month: dict[str, dict[str, float]] = {}
        for r in rows:
            cat = cats.get(r.category_id)
            if cat and cat.parent_id:
                parent = cats.get(cat.parent_id)
                name = parent.title if parent else "Другое"
            elif cat:
                name = cat.title
            else:
                name = "Без категории"
            parent_month.setdefault(name, {})
            parent_month[name][r.month] = parent_month[name].get(r.month, 0) + float(r.total or 0)

        # Top 5 by total
        totals = {name: sum(d.values()) for name, d in parent_month.items()}
        top5 = sorted(totals, key=lambda n: -totals[n])[:5]

        series = {}
        for name in top5:
            series[name] = [round(parent_month.get(name, {}).get(mk, 0), 2) for mk in month_keys]

        return {"categories": top5, "months": month_keys, "series": series}
