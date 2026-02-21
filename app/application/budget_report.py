"""
Budget report service: analytical aggregation over a date range.

Computes plan-vs-fact totals, quality score, per-category breakdown,
savings (goal deposits/withdrawals), and monthly dynamics.
"""
from datetime import datetime, date as date_type
from decimal import Decimal
from math import sqrt
from typing import Dict, Any, List, Tuple

from sqlalchemy import func, case, and_, literal
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    BudgetMonth, BudgetLine, BudgetGoalPlan, BudgetGoalWithdrawalPlan,
    CategoryInfo, TransactionFeed, GoalInfo, WalletBalance,
)

_ZERO = Decimal("0")

_MONTH_LABELS = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр", 5: "Май", 6: "Июн",
    7: "Июл", 8: "Авг", 9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


def _month_range(y_from: int, m_from: int, y_to: int, m_to: int) -> List[Tuple[int, int]]:
    """Return list of (year, month) tuples from start to end inclusive."""
    result = []
    y, m = y_from, m_from
    while (y, m) <= (y_to, m_to):
        result.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return result


def _month_start(y: int, m: int) -> datetime:
    return datetime(y, m, 1)


def _month_end(y: int, m: int) -> datetime:
    """Return first day of next month."""
    if m == 12:
        return datetime(y + 1, 1, 1)
    return datetime(y, m + 1, 1)


def _month_label(y: int, m: int) -> str:
    return f"{_MONTH_LABELS[m]} {y}"


class BudgetReportService:
    """Build budget report analytics for a date range."""

    def __init__(self, db: Session):
        self.db = db

    def build(
        self,
        account_id: int,
        year_from: int,
        month_from: int,
        year_to: int,
        month_to: int,
        budget_variant_id: int | None = None,
    ) -> Dict[str, Any]:
        months = _month_range(year_from, month_from, year_to, month_to)
        if not months:
            return self._empty_report(year_from, month_from, year_to, month_to)

        dt_start = _month_start(months[0][0], months[0][1])
        dt_end = _month_end(months[-1][0], months[-1][1])

        # Load categories
        categories = (
            self.db.query(CategoryInfo)
            .filter(
                CategoryInfo.account_id == account_id,
                CategoryInfo.is_archived == False,
                CategoryInfo.is_system == False,
            )
            .order_by(CategoryInfo.sort_order, CategoryInfo.title)
            .all()
        )
        expense_cats = [c for c in categories if c.category_type == "EXPENSE"]
        income_cats = [c for c in categories if c.category_type == "INCOME"]

        # Build period list for CASE WHEN bucketing
        periods = []
        for idx, (y, m) in enumerate(months):
            periods.append({
                "index": idx,
                "range_start": date_type(y, m, 1),
                "range_end": _month_end(y, m).date() if hasattr(_month_end(y, m), 'date') else date_type(
                    y + 1 if m == 12 else y, 1 if m == 12 else m + 1, 1),
            })

        # --- Data loading ---
        expense_plan = self._load_plans(account_id, budget_variant_id, months, "EXPENSE")
        income_plan = self._load_plans(account_id, budget_variant_id, months, "INCOME")
        expense_fact = self._load_fact(account_id, dt_start, dt_end, periods, "EXPENSE")
        income_fact = self._load_fact(account_id, dt_start, dt_end, periods, "INCOME")

        goal_deposit_fact = self._load_goal_deposits(account_id, dt_start, dt_end, periods)
        goal_withdrawal_fact = self._load_goal_withdrawals(account_id, dt_start, dt_end, periods)
        goal_deposit_plan = self._load_goal_plans(account_id, budget_variant_id, months, "deposit")
        goal_withdrawal_plan = self._load_goal_plans(account_id, budget_variant_id, months, "withdrawal")

        # --- Category table (expenses) ---
        cat_rows = self._build_category_table(expense_cats, expense_plan, expense_fact, months)

        total_expense_plan = sum((r["plan"] for r in cat_rows), _ZERO)
        total_expense_fact = sum((r["fact"] for r in cat_rows), _ZERO)

        # Also add uncategorized expenses (category_id not in known cats)
        known_cat_ids = {c.category_id for c in expense_cats}
        uncat_plan = _ZERO
        uncat_fact = _ZERO
        for (cat_id, mi), v in expense_plan.items():
            if cat_id not in known_cat_ids:
                uncat_plan += v
        for (cat_id, mi), v in expense_fact.items():
            if cat_id not in known_cat_ids:
                uncat_fact += v
        if uncat_fact or uncat_plan:
            uncat_delta = uncat_fact - uncat_plan
            cat_rows.append({
                "category_id": None,
                "title": "Прочие расходы",
                "parent_id": None,
                "plan": uncat_plan,
                "fact": uncat_fact,
                "delta": uncat_delta,
                "pct": float(uncat_fact / uncat_plan * 100) if uncat_plan else 0,
                "share_pct": 0.0,
                "is_over": uncat_fact > uncat_plan,
                "months": [],
            })
            total_expense_plan += uncat_plan
            total_expense_fact += uncat_fact

        # Recompute share_pct
        for r in cat_rows:
            r["share_pct"] = float(r["fact"] / total_expense_fact * 100) if total_expense_fact else 0.0

        # --- Income totals ---
        total_income_plan = _ZERO
        total_income_fact = _ZERO
        for v in income_plan.values():
            total_income_plan += v
        for v in income_fact.values():
            total_income_fact += v

        # --- Savings ---
        total_deposited = sum(goal_deposit_fact.values(), _ZERO)
        total_withdrawn = sum(goal_withdrawal_fact.values(), _ZERO)
        total_deposit_plan = sum(goal_deposit_plan.values(), _ZERO)
        total_withdrawal_plan = sum(goal_withdrawal_plan.values(), _ZERO)

        # --- Quality score ---
        monthly_expense_facts = self._compute_monthly_totals(expense_fact, months)
        quality = self._compute_quality_score(cat_rows, total_expense_plan, total_expense_fact, monthly_expense_facts)

        # --- Top-5 ---
        top5_over, top5_savings = self._compute_top5(cat_rows)

        # --- Savings block ---
        goals = (
            self.db.query(GoalInfo)
            .filter(GoalInfo.account_id == account_id, GoalInfo.is_archived == False, GoalInfo.is_system == False)
            .order_by(GoalInfo.title)
            .all()
        )
        savings = self._build_savings_block(
            goals, months, goal_deposit_fact, goal_withdrawal_fact,
            goal_deposit_plan, goal_withdrawal_plan,
            total_deposited, total_withdrawn, total_deposit_plan, total_withdrawal_plan,
        )

        # --- Monthly dynamics ---
        monthly_dynamics = self._build_monthly_dynamics(
            months, expense_plan, expense_fact, income_plan, income_fact,
            goal_deposit_fact, goal_withdrawal_fact,
        )

        # --- Summary ---
        expense_delta = total_expense_fact - total_expense_plan
        plan_compliance = (
            float(min(Decimal("100"), total_expense_fact / total_expense_plan * 100))
            if total_expense_plan else 0.0
        )
        net_result = total_income_fact - total_expense_fact
        net_savings = total_deposited - total_withdrawn

        return {
            "month_list": months,
            "month_labels": [_month_label(y, m) for y, m in months],
            "month_count": len(months),
            "period_label": f"{_month_label(*months[0])} — {_month_label(*months[-1])}" if len(months) > 1 else _month_label(*months[0]),
            "summary": {
                "expense_plan": total_expense_plan,
                "expense_fact": total_expense_fact,
                "expense_delta": expense_delta,
                "plan_compliance_pct": round(plan_compliance, 1),
                "income_plan": total_income_plan,
                "income_fact": total_income_fact,
                "net_result": net_result,
                "net_savings": net_savings,
            },
            "quality": quality,
            "category_rows": cat_rows,
            "top5_over": top5_over,
            "top5_savings": top5_savings,
            "savings": savings,
            "monthly_dynamics": monthly_dynamics,
        }

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def _load_plans(
        self, account_id: int, variant_id: int | None,
        months: List[Tuple[int, int]], kind: str,
    ) -> Dict[Tuple[int, int], Decimal]:
        """Load manual budget plans. Returns {(category_id, month_idx): amount}."""
        if not months:
            return {}

        ym_start = months[0][0] * 100 + months[0][1]
        ym_end = months[-1][0] * 100 + months[-1][1]
        month_to_idx = {ym: i for i, ym in enumerate(months)}

        q = (
            self.db.query(BudgetMonth)
            .filter(
                BudgetMonth.account_id == account_id,
                BudgetMonth.year * 100 + BudgetMonth.month >= ym_start,
                BudgetMonth.year * 100 + BudgetMonth.month <= ym_end,
            )
        )
        if variant_id is not None:
            q = q.filter(BudgetMonth.budget_variant_id == variant_id)
        budget_months = q.all()
        if not budget_months:
            return {}

        bm_to_idx: Dict[int, int] = {}
        for bm in budget_months:
            idx = month_to_idx.get((bm.year, bm.month))
            if idx is not None:
                bm_to_idx[bm.id] = idx

        if not bm_to_idx:
            return {}

        lines = (
            self.db.query(BudgetLine)
            .filter(
                BudgetLine.budget_month_id.in_(list(bm_to_idx.keys())),
                BudgetLine.kind == kind,
            )
            .all()
        )

        result: Dict[Tuple[int, int], Decimal] = {}
        for line in lines:
            mi = bm_to_idx.get(line.budget_month_id)
            if mi is not None:
                key = (line.category_id, mi)
                result[key] = result.get(key, _ZERO) + line.plan_amount
        return result

    def _load_fact(
        self, account_id: int, dt_start: datetime, dt_end: datetime,
        periods: List[Dict], op_type: str,
    ) -> Dict[Tuple[int, int], Decimal]:
        """Load fact from TransactionFeed using CASE WHEN bucketing.
        Returns {(category_id, month_idx): amount}."""
        if not periods:
            return {}

        whens = []
        for p in periods:
            s = p["range_start"]
            e = p["range_end"]
            cond = and_(
                TransactionFeed.occurred_at >= datetime(s.year, s.month, s.day),
                TransactionFeed.occurred_at < datetime(e.year, e.month, e.day),
            )
            whens.append((cond, literal(p["index"])))

        period_col = case(*whens, else_=literal(-1)).label("period_idx")

        rows = (
            self.db.query(
                TransactionFeed.category_id,
                period_col,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type == op_type,
                TransactionFeed.occurred_at >= dt_start,
                TransactionFeed.occurred_at < dt_end,
            )
            .group_by(TransactionFeed.category_id, period_col)
            .all()
        )

        result: Dict[Tuple[int, int], Decimal] = {}
        for row in rows:
            if row.period_idx >= 0:
                result[(row.category_id, row.period_idx)] = row.total or _ZERO
        return result

    def _load_goal_deposits(
        self, account_id: int, dt_start: datetime, dt_end: datetime,
        periods: List[Dict],
    ) -> Dict[Tuple[int, int], Decimal]:
        """REGULAR -> SAVINGS transfers by (goal_id, month_idx)."""
        if not periods:
            return {}

        whens = []
        for p in periods:
            s = p["range_start"]
            e = p["range_end"]
            cond = and_(
                TransactionFeed.occurred_at >= datetime(s.year, s.month, s.day),
                TransactionFeed.occurred_at < datetime(e.year, e.month, e.day),
            )
            whens.append((cond, literal(p["index"])))
        period_col = case(*whens, else_=literal(-1)).label("period_idx")

        from_wallet = self.db.query(
            WalletBalance.wallet_id, WalletBalance.wallet_type,
        ).subquery("from_w")

        rows = (
            self.db.query(
                TransactionFeed.to_goal_id,
                period_col,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .join(from_wallet, TransactionFeed.from_wallet_id == from_wallet.c.wallet_id)
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type == "TRANSFER",
                TransactionFeed.to_goal_id.isnot(None),
                from_wallet.c.wallet_type == "REGULAR",
                TransactionFeed.occurred_at >= dt_start,
                TransactionFeed.occurred_at < dt_end,
            )
            .group_by(TransactionFeed.to_goal_id, period_col)
            .all()
        )

        result: Dict[Tuple[int, int], Decimal] = {}
        for row in rows:
            if row.period_idx >= 0:
                result[(row.to_goal_id, row.period_idx)] = row.total or _ZERO
        return result

    def _load_goal_withdrawals(
        self, account_id: int, dt_start: datetime, dt_end: datetime,
        periods: List[Dict],
    ) -> Dict[Tuple[int, int], Decimal]:
        """SAVINGS -> REGULAR transfers by (goal_id, month_idx)."""
        if not periods:
            return {}

        whens = []
        for p in periods:
            s = p["range_start"]
            e = p["range_end"]
            cond = and_(
                TransactionFeed.occurred_at >= datetime(s.year, s.month, s.day),
                TransactionFeed.occurred_at < datetime(e.year, e.month, e.day),
            )
            whens.append((cond, literal(p["index"])))
        period_col = case(*whens, else_=literal(-1)).label("period_idx")

        from_wallet = self.db.query(
            WalletBalance.wallet_id, WalletBalance.wallet_type,
        ).subquery("from_w")
        to_wallet = self.db.query(
            WalletBalance.wallet_id, WalletBalance.wallet_type,
        ).subquery("to_w")

        rows = (
            self.db.query(
                TransactionFeed.from_goal_id,
                period_col,
                func.sum(TransactionFeed.amount).label("total"),
            )
            .join(from_wallet, TransactionFeed.from_wallet_id == from_wallet.c.wallet_id)
            .join(to_wallet, TransactionFeed.to_wallet_id == to_wallet.c.wallet_id)
            .filter(
                TransactionFeed.account_id == account_id,
                TransactionFeed.operation_type == "TRANSFER",
                TransactionFeed.from_goal_id.isnot(None),
                from_wallet.c.wallet_type == "SAVINGS",
                to_wallet.c.wallet_type == "REGULAR",
                TransactionFeed.occurred_at >= dt_start,
                TransactionFeed.occurred_at < dt_end,
            )
            .group_by(TransactionFeed.from_goal_id, period_col)
            .all()
        )

        result: Dict[Tuple[int, int], Decimal] = {}
        for row in rows:
            if row.period_idx >= 0:
                result[(row.from_goal_id, row.period_idx)] = row.total or _ZERO
        return result

    def _load_goal_plans(
        self, account_id: int, variant_id: int | None,
        months: List[Tuple[int, int]], plan_type: str,
    ) -> Dict[Tuple[int, int], Decimal]:
        """Load goal deposit or withdrawal plans. Returns {(goal_id, month_idx): amount}."""
        if not months:
            return {}

        ym_start = months[0][0] * 100 + months[0][1]
        ym_end = months[-1][0] * 100 + months[-1][1]
        month_to_idx = {ym: i for i, ym in enumerate(months)}

        q = (
            self.db.query(BudgetMonth)
            .filter(
                BudgetMonth.account_id == account_id,
                BudgetMonth.year * 100 + BudgetMonth.month >= ym_start,
                BudgetMonth.year * 100 + BudgetMonth.month <= ym_end,
            )
        )
        if variant_id is not None:
            q = q.filter(BudgetMonth.budget_variant_id == variant_id)
        budget_months = q.all()
        if not budget_months:
            return {}

        bm_to_idx: Dict[int, int] = {}
        for bm in budget_months:
            idx = month_to_idx.get((bm.year, bm.month))
            if idx is not None:
                bm_to_idx[bm.id] = idx

        if not bm_to_idx:
            return {}

        PlanModel = BudgetGoalPlan if plan_type == "deposit" else BudgetGoalWithdrawalPlan
        plans = (
            self.db.query(PlanModel)
            .filter(PlanModel.budget_month_id.in_(list(bm_to_idx.keys())))
            .all()
        )

        result: Dict[Tuple[int, int], Decimal] = {}
        for plan in plans:
            mi = bm_to_idx.get(plan.budget_month_id)
            if mi is not None:
                key = (plan.goal_id, mi)
                result[key] = result.get(key, _ZERO) + plan.plan_amount
        return result

    # ------------------------------------------------------------------
    # Computations
    # ------------------------------------------------------------------

    def _build_category_table(
        self,
        cats: List[CategoryInfo],
        plan_map: Dict[Tuple[int, int], Decimal],
        fact_map: Dict[Tuple[int, int], Decimal],
        months: List[Tuple[int, int]],
    ) -> List[Dict]:
        """Build per-category expense rows with plan/fact/delta."""
        n = len(months)
        rows = []
        for cat in cats:
            plan_total = _ZERO
            fact_total = _ZERO
            month_data = []
            for mi in range(n):
                p = plan_map.get((cat.category_id, mi), _ZERO)
                f = fact_map.get((cat.category_id, mi), _ZERO)
                plan_total += p
                fact_total += f
                month_data.append({
                    "year": months[mi][0],
                    "month": months[mi][1],
                    "label": _month_label(months[mi][0], months[mi][1]),
                    "plan": p,
                    "fact": f,
                    "delta": f - p,
                })
            delta = fact_total - plan_total
            pct = float(fact_total / plan_total * 100) if plan_total else 0.0
            rows.append({
                "category_id": cat.category_id,
                "title": cat.title,
                "parent_id": cat.parent_id,
                "plan": plan_total,
                "fact": fact_total,
                "delta": delta,
                "pct": pct,
                "share_pct": 0.0,  # computed later
                "is_over": fact_total > plan_total and plan_total > 0,
                "months": month_data,
            })
        return rows

    def _compute_monthly_totals(
        self, fact_map: Dict[Tuple[int, int], Decimal],
        months: List[Tuple[int, int]],
    ) -> List[Decimal]:
        """Sum all category facts per month index."""
        n = len(months)
        totals = [_ZERO] * n
        for (cat_id, mi), v in fact_map.items():
            if 0 <= mi < n:
                totals[mi] += v
        return totals

    def _compute_quality_score(
        self,
        cat_rows: List[Dict],
        total_plan: Decimal,
        total_fact: Decimal,
        monthly_facts: List[Decimal],
    ) -> Dict[str, Any]:
        """Compute quality score 0-100 with penalty breakdown."""
        # penalty_over: category-level overbudget
        over_budget = sum(
            (max(_ZERO, r["fact"] - r["plan"]) for r in cat_rows if r["plan"] > 0),
            _ZERO,
        )
        over_share = float(over_budget / max(total_fact, Decimal("1")))
        penalty_over = min(50.0, over_share * 100)

        # penalty_plan: overall ratio deviation
        if total_plan > 0:
            plan_ratio = float(total_fact / total_plan)
            penalty_plan = min(25.0, abs(plan_ratio - 1.0) * 100)
        else:
            penalty_plan = 0.0

        # penalty_stability: coefficient of variation of monthly expenses
        if len(monthly_facts) > 1:
            facts_f = [float(f) for f in monthly_facts]
            mean_val = sum(facts_f) / len(facts_f)
            if mean_val > 0:
                variance = sum((x - mean_val) ** 2 for x in facts_f) / len(facts_f)
                cv = sqrt(variance) / mean_val
                penalty_stability = min(25.0, cv * 100)
            else:
                penalty_stability = 0.0
        else:
            penalty_stability = 0.0

        score = max(0, min(100, round(100 - penalty_over - penalty_plan - penalty_stability)))

        return {
            "score": score,
            "penalty_over": round(penalty_over, 1),
            "penalty_plan": round(penalty_plan, 1),
            "penalty_stability": round(penalty_stability, 1),
        }

    def _compute_top5(
        self, cat_rows: List[Dict],
    ) -> Tuple[List[Dict], List[Dict]]:
        """Top-5 overbudget and top-5 savings categories."""
        over = sorted(
            [r for r in cat_rows if r["delta"] > 0],
            key=lambda r: r["delta"],
            reverse=True,
        )[:5]
        savings = sorted(
            [r for r in cat_rows if r["delta"] < 0],
            key=lambda r: r["delta"],
        )[:5]
        top5_over = [{"title": r["title"], "delta": r["delta"]} for r in over]
        top5_savings = [{"title": r["title"], "delta": r["delta"]} for r in savings]
        return top5_over, top5_savings

    def _build_savings_block(
        self,
        goals: List[GoalInfo],
        months: List[Tuple[int, int]],
        deposit_fact: Dict[Tuple[int, int], Decimal],
        withdrawal_fact: Dict[Tuple[int, int], Decimal],
        deposit_plan: Dict[Tuple[int, int], Decimal],
        withdrawal_plan: Dict[Tuple[int, int], Decimal],
        total_deposited: Decimal,
        total_withdrawn: Decimal,
        total_deposit_plan: Decimal,
        total_withdrawal_plan: Decimal,
    ) -> Dict[str, Any]:
        """Build savings section: totals + per-month table."""
        n = len(months)

        # Monthly totals
        monthly = []
        for mi, (y, m) in enumerate(months):
            dep = sum((v for (gid, idx), v in deposit_fact.items() if idx == mi), _ZERO)
            wdr = sum((v for (gid, idx), v in withdrawal_fact.items() if idx == mi), _ZERO)
            monthly.append({
                "year": y, "month": m,
                "label": _month_label(y, m),
                "deposited": dep,
                "withdrawn": wdr,
                "net": dep - wdr,
            })

        return {
            "total_deposited": total_deposited,
            "total_withdrawn": total_withdrawn,
            "net": total_deposited - total_withdrawn,
            "deposit_plan": total_deposit_plan,
            "withdrawal_plan": total_withdrawal_plan,
            "monthly": monthly,
        }

    def _build_monthly_dynamics(
        self,
        months: List[Tuple[int, int]],
        expense_plan: Dict[Tuple[int, int], Decimal],
        expense_fact: Dict[Tuple[int, int], Decimal],
        income_plan: Dict[Tuple[int, int], Decimal],
        income_fact: Dict[Tuple[int, int], Decimal],
        deposit_fact: Dict[Tuple[int, int], Decimal],
        withdrawal_fact: Dict[Tuple[int, int], Decimal],
    ) -> List[Dict]:
        """Build per-month summary rows."""
        result = []
        for mi, (y, m) in enumerate(months):
            ep = sum((v for (cid, idx), v in expense_plan.items() if idx == mi), _ZERO)
            ef = sum((v for (cid, idx), v in expense_fact.items() if idx == mi), _ZERO)
            ip = sum((v for (cid, idx), v in income_plan.items() if idx == mi), _ZERO)
            ifa = sum((v for (cid, idx), v in income_fact.items() if idx == mi), _ZERO)
            dep = sum((v for (gid, idx), v in deposit_fact.items() if idx == mi), _ZERO)
            wdr = sum((v for (gid, idx), v in withdrawal_fact.items() if idx == mi), _ZERO)
            result.append({
                "year": y, "month": m,
                "label": _month_label(y, m),
                "expense_plan": ep,
                "expense_fact": ef,
                "expense_delta": ef - ep,
                "expense_pct": float(ef / ep * 100) if ep else 0.0,
                "income_plan": ip,
                "income_fact": ifa,
                "net_result": ifa - ef,
                "deposited": dep,
                "withdrawn": wdr,
                "net_savings": dep - wdr,
            })
        return result

    def _empty_report(self, yf: int, mf: int, yt: int, mt: int) -> Dict[str, Any]:
        return {
            "month_list": [],
            "month_labels": [],
            "month_count": 0,
            "period_label": "",
            "summary": {
                "expense_plan": _ZERO, "expense_fact": _ZERO, "expense_delta": _ZERO,
                "plan_compliance_pct": 0.0,
                "income_plan": _ZERO, "income_fact": _ZERO,
                "net_result": _ZERO, "net_savings": _ZERO,
            },
            "quality": {"score": 100, "penalty_over": 0.0, "penalty_plan": 0.0, "penalty_stability": 0.0},
            "category_rows": [],
            "top5_over": [],
            "top5_savings": [],
            "savings": {
                "total_deposited": _ZERO, "total_withdrawn": _ZERO, "net": _ZERO,
                "deposit_plan": _ZERO, "withdrawal_plan": _ZERO, "monthly": [],
            },
            "monthly_dynamics": [],
        }
