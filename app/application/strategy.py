"""
Strategic dashboard — Life Score computation, history, breakdown, simulator.

Aggregates finances, projects, and discipline into a single 0-100 score.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from app.infrastructure.db.models import (
    ProjectModel,
    TaskModel,
    StrategicMonthSnapshot,
    StrategicScoreBreakdown,
)
from app.application.dashboard import DashboardService
from app.application.project_analytics import ProjectAnalyticsService, _month_range


# ── Score-normalisation functions (pure, reusable by simulator) ──

WEIGHTS = {
    "finance": 0.40,
    "discipline": 0.25,
    "projects": 0.20,
    "focus": 0.15,
}


def _clamp(val: float, lo: float = 0, hi: float = 100) -> float:
    return max(lo, min(hi, val))


def finance_score_from(debt_ratio: float, savings_rate: float) -> float:
    if debt_ratio <= 30:
        base = 100.0
    elif debt_ratio <= 50:
        base = 70.0
    else:
        base = 30.0
    if savings_rate >= 25:
        base += 20
    elif savings_rate <= 0:
        base -= 20
    return _clamp(base)


def discipline_score_from(global_discipline_pct: float) -> float:
    if global_discipline_pct >= 80:
        return 100.0
    if global_discipline_pct >= 65:
        return 75.0
    if global_discipline_pct >= 50:
        return 50.0
    return 30.0


def project_score_from(avg_discipline: float, overdue_total: int) -> float:
    if avg_discipline >= 75:
        base = 100.0
    elif avg_discipline >= 55:
        base = 70.0
    else:
        base = 40.0
    if overdue_total > 5:
        base -= 10
    return _clamp(base)


def focus_score_from(in_progress: int) -> float:
    if in_progress <= 3:
        return 100.0
    if in_progress <= 5:
        return 80.0
    if in_progress <= 8:
        return 60.0
    return 40.0


def life_score_from(
    finance: float, discipline: float, project: float, focus: float,
) -> float:
    return round(
        WEIGHTS["finance"] * finance
        + WEIGHTS["discipline"] * discipline
        + WEIGHTS["projects"] * project
        + WEIGHTS["focus"] * focus,
        1,
    )


class StrategyService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute(self, account_id: int, year: int, month: int) -> dict[str, Any]:
        """Compute full strategy for a month, upsert snapshot + breakdown."""
        today = date(year, month, 1)
        dash = DashboardService(self.db)

        # ── 1. Finance ──
        fin = dash.get_fin_state_summary(account_id, today)
        regular = Decimal(str(fin["regular_total"]))
        credit_total = Decimal(str(fin["credit_total"]))
        savings = Decimal(str(fin["savings_total"]))

        assets = float(regular + savings)
        debt = float(abs(credit_total))
        savings_val = float(savings)

        debt_ratio = round(debt / assets * 100, 1) if assets > 0 else 0.0

        fin_summary = dash.get_financial_summary(account_id, today)
        rub = fin_summary.get("RUB", {})
        income_mtd = float(rub.get("income", 0))
        expense_mtd = float(rub.get("expense", 0))
        savings_rate = round((income_mtd - expense_mtd) / income_mtd * 100, 1) if income_mtd > 0 else 0.0

        f_score = finance_score_from(debt_ratio, savings_rate)

        # ── 2. Projects ──
        active_projects = (
            self.db.query(ProjectModel)
            .filter(
                ProjectModel.account_id == account_id,
                ProjectModel.status == "active",
            )
            .all()
        )

        pa_svc = ProjectAnalyticsService(self.db)
        disc_values: list[float] = []
        overdue_total = 0
        for proj in active_projects:
            pa = pa_svc.compute(proj.id, account_id, year, month)
            disc_values.append(float(pa["discipline_percent"]))
            overdue_total += pa["overdue_open_count"]

        avg_disc = round(sum(disc_values) / len(disc_values), 1) if disc_values else 0.0
        p_score = project_score_from(avg_disc, overdue_total)

        # ── 3. Global discipline ──
        month_start, month_end = _month_range(year, month)

        all_completed = (
            self.db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.status == "DONE",
                TaskModel.completed_at.isnot(None),
                TaskModel.due_date.isnot(None),
            )
            .all()
        )

        global_on_time = 0
        global_late = 0
        for t in all_completed:
            if t.completed_at is None or t.due_date is None:
                continue
            if not (month_start <= t.completed_at.date() < month_end):
                continue
            if t.completed_at.date() <= t.due_date:
                global_on_time += 1
            else:
                global_late += 1

        global_total = global_on_time + global_late
        global_discipline = round(global_on_time / global_total * 100, 1) if global_total else 0.0
        d_score = discipline_score_from(global_discipline)

        # ── 4. Focus ──
        in_progress_count = (
            self.db.query(TaskModel)
            .filter(
                TaskModel.account_id == account_id,
                TaskModel.board_status == "in_progress",
                TaskModel.status == "ACTIVE",
            )
            .count()
        )
        fo_score = focus_score_from(in_progress_count)

        # ── 5. Life Score ──
        ls = life_score_from(f_score, d_score, p_score, fo_score)

        data = {
            "account_id": account_id,
            "year": year,
            "month": month,
            # Finance
            "assets_total": assets,
            "debt_total": debt,
            "debt_ratio": debt_ratio,
            "savings_total": savings_val,
            "income_mtd": income_mtd,
            "expense_mtd": expense_mtd,
            "savings_rate": savings_rate,
            # Projects
            "active_projects_count": len(active_projects),
            "projects_avg_discipline": avg_disc,
            "projects_overdue_total": overdue_total,
            # Discipline
            "global_discipline_percent": global_discipline,
            # Focus
            "in_progress_total": in_progress_count,
            "focus_score": fo_score,
            # Scores
            "finance_score": f_score,
            "discipline_score": d_score,
            "project_score": p_score,
            "life_score": ls,
            "life_score_projection": ls,
        }

        snap = self._upsert_snapshot(data)
        self._upsert_breakdown(snap, data)
        return data

    # ------------------------------------------------------------------
    # History (12 months)
    # ------------------------------------------------------------------

    def get_history(self, account_id: int, year: int, month: int) -> list[dict]:
        """Return 12-month history ending at (year, month).

        Backfills missing months via compute (idempotent — skips existing).
        """
        months = _last_12_months(year, month)
        history: list[dict] = []

        for y, m in months:
            snap = (
                self.db.query(StrategicMonthSnapshot)
                .filter(
                    StrategicMonthSnapshot.account_id == account_id,
                    StrategicMonthSnapshot.year == y,
                    StrategicMonthSnapshot.month == m,
                )
                .first()
            )
            if snap is None:
                self.compute(account_id, y, m)
                snap = (
                    self.db.query(StrategicMonthSnapshot)
                    .filter(
                        StrategicMonthSnapshot.account_id == account_id,
                        StrategicMonthSnapshot.year == y,
                        StrategicMonthSnapshot.month == m,
                    )
                    .first()
                )

            if snap:
                history.append({
                    "year": snap.year,
                    "month": snap.month,
                    "life_score": float(snap.life_score),
                    "finance_score": float(snap.finance_score),
                    "discipline_score": float(snap.discipline_score),
                    "project_score": float(snap.project_score),
                    "focus_score": float(snap.focus_score),
                })
            else:
                history.append({
                    "year": y, "month": m,
                    "life_score": 0, "finance_score": 0,
                    "discipline_score": 0, "project_score": 0, "focus_score": 0,
                })

        return history

    # ------------------------------------------------------------------
    # Breakdown
    # ------------------------------------------------------------------

    def get_breakdown(self, account_id: int, year: int, month: int) -> list[dict]:
        """Top-5 penalty items for the current snapshot."""
        snap = (
            self.db.query(StrategicMonthSnapshot)
            .filter(
                StrategicMonthSnapshot.account_id == account_id,
                StrategicMonthSnapshot.year == year,
                StrategicMonthSnapshot.month == month,
            )
            .first()
        )
        if snap is None:
            return []

        rows = (
            self.db.query(StrategicScoreBreakdown)
            .filter(
                StrategicScoreBreakdown.snapshot_id == snap.id,
                StrategicScoreBreakdown.penalty_value > 0,
            )
            .order_by(StrategicScoreBreakdown.penalty_value.desc())
            .limit(5)
            .all()
        )
        return [
            {
                "component": r.component,
                "metric_key": r.metric_key,
                "raw_value": float(r.raw_value) if r.raw_value is not None else None,
                "normalized_score": float(r.normalized_score),
                "weight": float(r.weight),
                "penalty_value": float(r.penalty_value),
                "penalty_reason": r.penalty_reason,
                "link_url": r.link_url,
            }
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Simulator
    # ------------------------------------------------------------------

    @staticmethod
    def simulate(
        current_data: dict[str, Any],
        discipline_target: float | None = None,
        focus_target: int | None = None,
        debt_ratio_target: float | None = None,
        savings_rate_target: float | None = None,
    ) -> dict[str, Any]:
        """Recalculate life score with overridden inputs (no DB writes)."""
        dr = debt_ratio_target if debt_ratio_target is not None else current_data["debt_ratio"]
        sr = savings_rate_target if savings_rate_target is not None else current_data["savings_rate"]
        disc = discipline_target if discipline_target is not None else current_data["global_discipline_percent"]
        foc = focus_target if focus_target is not None else current_data["in_progress_total"]

        new_fin = finance_score_from(dr, sr)
        new_disc = discipline_score_from(disc)
        new_proj = current_data["project_score"]  # not overridable in simulator
        new_foc = focus_score_from(foc)
        new_ls = life_score_from(new_fin, new_disc, new_proj, new_foc)

        return {
            "finance_score": new_fin,
            "discipline_score": new_disc,
            "project_score": new_proj,
            "focus_score": new_foc,
            "life_score": new_ls,
            "delta": round(new_ls - current_data["life_score"], 1),
            # echo back targets
            "debt_ratio": dr,
            "savings_rate": sr,
            "discipline_target": disc,
            "focus_target": foc,
        }

    # ------------------------------------------------------------------
    # Drag factors (kept for backward compat, now uses breakdown too)
    # ------------------------------------------------------------------

    @staticmethod
    def get_drag_factors(data: dict[str, Any]) -> list[dict[str, Any]]:
        """Identify top factors pulling Life Score down."""
        factors: list[dict[str, Any]] = []

        if data["debt_ratio"] > 30:
            factors.append({
                "label": f"Долговая нагрузка {data['debt_ratio']}%",
                "impact": round(-(100 - data["finance_score"]) * 0.40, 1),
            })

        if data["savings_rate"] <= 0:
            factors.append({
                "label": "Отрицательная норма сбережений",
                "impact": round(-(100 - data["finance_score"]) * 0.40, 1),
            })

        if data["projects_overdue_total"] > 0:
            factors.append({
                "label": f"Просрочено {data['projects_overdue_total']} задач в проектах",
                "impact": round(-(100 - data["project_score"]) * 0.20, 1),
            })

        if data["global_discipline_percent"] < 80:
            factors.append({
                "label": f"Дисциплина {data['global_discipline_percent']}%",
                "impact": round(-(100 - data["discipline_score"]) * 0.25, 1),
            })

        if data["in_progress_total"] > 5:
            factors.append({
                "label": f"Слишком много задач в работе ({data['in_progress_total']})",
                "impact": round(-(100 - data["focus_score"]) * 0.15, 1),
            })

        factors.sort(key=lambda f: f["impact"])
        return factors[:3]

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _upsert_snapshot(self, data: dict[str, Any]) -> StrategicMonthSnapshot:
        snap = (
            self.db.query(StrategicMonthSnapshot)
            .filter(
                StrategicMonthSnapshot.account_id == data["account_id"],
                StrategicMonthSnapshot.year == data["year"],
                StrategicMonthSnapshot.month == data["month"],
            )
            .first()
        )
        if snap is None:
            snap = StrategicMonthSnapshot(
                account_id=data["account_id"],
                year=data["year"],
                month=data["month"],
            )
            self.db.add(snap)

        for key in (
            "assets_total", "debt_total", "debt_ratio", "savings_total",
            "income_mtd", "expense_mtd", "savings_rate",
            "active_projects_count", "projects_avg_discipline", "projects_overdue_total",
            "global_discipline_percent",
            "in_progress_total", "focus_score",
            "finance_score", "discipline_score", "project_score",
            "life_score", "life_score_projection",
        ):
            setattr(snap, key, data[key])

        snap.calculated_at = sa_func.now()
        self.db.flush()
        return snap

    def _upsert_breakdown(self, snap: StrategicMonthSnapshot, data: dict) -> None:
        """Write per-metric breakdown rows for the snapshot."""
        # Clear old breakdown
        self.db.query(StrategicScoreBreakdown).filter(
            StrategicScoreBreakdown.snapshot_id == snap.id,
        ).delete()
        self.db.flush()

        rows: list[dict] = []

        # ── Finance metrics ──
        ideal_fin = 100.0
        actual_fin = data["finance_score"]
        fin_penalty = round(ideal_fin - actual_fin, 2)

        # debt_ratio
        dr_penalty = 0.0
        dr_reason = None
        dr_link = None
        if data["debt_ratio"] > 30:
            dr_penalty = fin_penalty
            dr_reason = f"Долговая нагрузка {data['debt_ratio']}% (цель ≤30%)"
            dr_link = "/wallets"
        rows.append({
            "component": "finance", "metric_key": "debt_ratio",
            "raw_value": data["debt_ratio"], "normalized_score": actual_fin,
            "weight": WEIGHTS["finance"],
            "penalty_value": dr_penalty, "penalty_reason": dr_reason, "link_url": dr_link,
        })

        # savings_rate
        sr_penalty = 0.0
        sr_reason = None
        if data["savings_rate"] <= 0:
            sr_penalty = round(20 * WEIGHTS["finance"], 2)
            sr_reason = f"Норма сбережений {data['savings_rate']}% (цель ≥25%)"
        elif data["savings_rate"] < 25:
            sr_penalty = 0.0
            sr_reason = None
        rows.append({
            "component": "finance", "metric_key": "savings_rate",
            "raw_value": data["savings_rate"], "normalized_score": actual_fin,
            "weight": WEIGHTS["finance"],
            "penalty_value": sr_penalty, "penalty_reason": sr_reason,
            "link_url": "/transactions" if sr_penalty > 0 else None,
        })

        # ── Discipline metric ──
        ideal_disc = 100.0
        actual_disc = data["discipline_score"]
        disc_penalty = round((ideal_disc - actual_disc) * WEIGHTS["discipline"], 2)
        disc_reason = None
        if data["global_discipline_percent"] < 80:
            disc_reason = f"Дисциплина {data['global_discipline_percent']}% (цель ≥80%)"
        rows.append({
            "component": "discipline", "metric_key": "global_discipline",
            "raw_value": data["global_discipline_percent"],
            "normalized_score": actual_disc, "weight": WEIGHTS["discipline"],
            "penalty_value": disc_penalty if disc_reason else 0,
            "penalty_reason": disc_reason,
            "link_url": "/tasks" if disc_reason else None,
        })

        # ── Projects metrics ──
        actual_proj = data["project_score"]
        proj_penalty = round((100 - actual_proj) * WEIGHTS["projects"], 2)

        # avg_discipline
        avg_d_reason = None
        if data["projects_avg_discipline"] < 75:
            avg_d_reason = f"Средняя дисциплина проектов {data['projects_avg_discipline']}% (цель ≥75%)"
        rows.append({
            "component": "projects", "metric_key": "avg_project_discipline",
            "raw_value": data["projects_avg_discipline"],
            "normalized_score": actual_proj, "weight": WEIGHTS["projects"],
            "penalty_value": proj_penalty if avg_d_reason else 0,
            "penalty_reason": avg_d_reason,
            "link_url": "/projects" if avg_d_reason else None,
        })

        # overdue
        ovd_reason = None
        ovd_penalty = 0.0
        if data["projects_overdue_total"] > 5:
            ovd_penalty = round(10 * WEIGHTS["projects"], 2)
            ovd_reason = f"Просрочено {data['projects_overdue_total']} задач (порог >5)"
        elif data["projects_overdue_total"] > 0:
            ovd_reason = f"Просрочено {data['projects_overdue_total']} задач в проектах"
            ovd_penalty = round(ovd_penalty, 2)
        rows.append({
            "component": "projects", "metric_key": "overdue",
            "raw_value": data["projects_overdue_total"],
            "normalized_score": actual_proj, "weight": WEIGHTS["projects"],
            "penalty_value": ovd_penalty, "penalty_reason": ovd_reason,
            "link_url": "/tasks" if ovd_reason else None,
        })

        # ── Focus metric ──
        actual_foc = data["focus_score"]
        foc_penalty = round((100 - actual_foc) * WEIGHTS["focus"], 2)
        foc_reason = None
        if data["in_progress_total"] > 5:
            foc_reason = f"В работе {data['in_progress_total']} задач (цель ≤3)"
        elif data["in_progress_total"] > 3:
            foc_reason = f"В работе {data['in_progress_total']} задач (цель ≤3)"
        rows.append({
            "component": "focus", "metric_key": "wip",
            "raw_value": data["in_progress_total"],
            "normalized_score": actual_foc, "weight": WEIGHTS["focus"],
            "penalty_value": foc_penalty if foc_reason else 0,
            "penalty_reason": foc_reason,
            "link_url": "/projects" if foc_reason else None,
        })

        for r in rows:
            self.db.add(StrategicScoreBreakdown(snapshot_id=snap.id, **r))
        self.db.flush()


# ------------------------------------------------------------------
# Pure helpers
# ------------------------------------------------------------------

_MONTH_NAMES_SHORT = {
    1: "Янв", 2: "Фев", 3: "Мар", 4: "Апр",
    5: "Май", 6: "Июн", 7: "Июл", 8: "Авг",
    9: "Сен", 10: "Окт", 11: "Ноя", 12: "Дек",
}


def _last_12_months(year: int, month: int) -> list[tuple[int, int]]:
    """Return list of (year, month) for the 12 months ending at (year, month)."""
    result = []
    y, m = year, month
    for _ in range(12):
        result.append((y, m))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    result.reverse()
    return result
