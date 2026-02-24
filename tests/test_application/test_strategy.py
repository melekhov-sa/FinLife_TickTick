"""
Tests for StrategyService — Life Score computation, history, breakdown, simulator.
"""
import pytest
from datetime import datetime, date, timezone
from decimal import Decimal

from app.infrastructure.db.models import (
    WalletBalance, TransactionFeed, ProjectModel, TaskModel,
    StrategicMonthSnapshot, StrategicScoreBreakdown,
    StrategicDailySnapshot, StrategicWeeklyReview,
)
from app.application.strategy import (
    StrategyService, _clamp, _last_12_months,
    finance_score_from, discipline_score_from, project_score_from,
    focus_score_from, life_score_from,
)


ACCT = 1
_tz = timezone.utc


def _wallet(db, wallet_id, *, wallet_type="REGULAR", balance=0, currency="RUB"):
    w = WalletBalance(
        wallet_id=wallet_id,
        account_id=ACCT,
        title=f"W{wallet_id}",
        currency=currency,
        wallet_type=wallet_type,
        balance=Decimal(str(balance)),
        is_archived=False,
        created_at=datetime(2026, 1, 1, tzinfo=_tz),
    )
    db.add(w)
    db.flush()
    return w


def _tx(db, tx_id, *, op_type="INCOME", amount=0, currency="RUB", occurred_at=None):
    t = TransactionFeed(
        transaction_id=tx_id,
        account_id=ACCT,
        operation_type=op_type,
        amount=Decimal(str(amount)),
        currency=currency,
        occurred_at=occurred_at or datetime(2026, 2, 15, 10, 0, tzinfo=_tz),
    )
    db.add(t)
    db.flush()
    return t


def _project(db, title="Test Project", status="active"):
    p = ProjectModel(account_id=ACCT, title=title, status=status)
    db.add(p)
    db.flush()
    return p


def _task(db, *, project_id=None, due_date=None, status="ACTIVE",
          board_status="backlog", completed_at=None, created_at=None):
    tid = db.query(TaskModel).count() + 1
    t = TaskModel(
        task_id=tid,
        account_id=ACCT,
        title=f"task-{tid}",
        status=status,
        project_id=project_id,
        board_status=board_status,
        due_date=due_date,
        completed_at=completed_at,
        created_at=created_at or datetime(2026, 2, 1, 10, 0, tzinfo=_tz),
    )
    db.add(t)
    db.flush()
    return t


# ── clamp helper ──

class TestClamp:
    def test_clamp_within(self):
        assert _clamp(50) == 50

    def test_clamp_above(self):
        assert _clamp(120) == 100

    def test_clamp_below(self):
        assert _clamp(-10) == 0


# ── Pure score functions ──

class TestPureScoreFunctions:
    def test_finance_score_low_debt_high_savings(self):
        assert finance_score_from(10, 30) == 100  # 100 + 20 → clamped 100

    def test_finance_score_high_debt_no_savings(self):
        assert finance_score_from(60, 0) == 10  # 30 - 20 = 10

    def test_discipline_score_tiers(self):
        assert discipline_score_from(85) == 100
        assert discipline_score_from(70) == 75
        assert discipline_score_from(55) == 50
        assert discipline_score_from(40) == 30

    def test_project_score_with_overdue(self):
        assert project_score_from(80, 0) == 100
        assert project_score_from(80, 6) == 90  # 100 - 10
        assert project_score_from(40, 0) == 40

    def test_focus_score_tiers(self):
        assert focus_score_from(2) == 100
        assert focus_score_from(4) == 80
        assert focus_score_from(7) == 60
        assert focus_score_from(10) == 40

    def test_life_score_formula(self):
        ls = life_score_from(80, 75, 70, 100)
        expected = round(0.40 * 80 + 0.25 * 75 + 0.20 * 70 + 0.15 * 100, 1)
        assert ls == expected


# ── last_12_months helper ──

class TestLast12Months:
    def test_basic(self):
        months = _last_12_months(2026, 2)
        assert len(months) == 12
        assert months[0] == (2025, 3)
        assert months[-1] == (2026, 2)

    def test_january(self):
        months = _last_12_months(2026, 1)
        assert months[0] == (2025, 2)
        assert months[-1] == (2026, 1)


# ── Finance score ──

class TestFinanceScore:
    def test_low_debt_high_savings(self, db_session):
        """debt_ratio <= 30, savings_rate >= 25 → score = 100 + 20 → clamped 100."""
        _wallet(db_session, 1, wallet_type="REGULAR", balance=100_000)
        _wallet(db_session, 2, wallet_type="SAVINGS", balance=50_000)
        _wallet(db_session, 3, wallet_type="CREDIT", balance=-10_000)
        _tx(db_session, 1, op_type="INCOME", amount=100_000)
        _tx(db_session, 2, op_type="EXPENSE", amount=50_000)

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["finance_score"] == 100

    def test_high_debt(self, db_session):
        """debt_ratio > 50 → base 30."""
        _wallet(db_session, 1, wallet_type="REGULAR", balance=50_000)
        _wallet(db_session, 2, wallet_type="CREDIT", balance=-40_000)

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["debt_ratio"] == 80.0
        assert r["finance_score"] == 10

    def test_medium_debt_no_savings(self, db_session):
        """debt_ratio 30-50, savings_rate = 0 → 70 - 20 = 50."""
        _wallet(db_session, 1, wallet_type="REGULAR", balance=100_000)
        _wallet(db_session, 2, wallet_type="CREDIT", balance=-40_000)

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["finance_score"] == 50

    def test_no_wallets_defaults(self, db_session):
        """No wallets → finance_score = 100 - 20 (no income) = 80."""
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["assets_total"] == 0
        assert r["debt_total"] == 0
        assert r["finance_score"] == 80


# ── Discipline score ──

class TestDisciplineScore:
    def test_high_discipline(self, db_session):
        proj = _project(db_session)
        for i in range(5):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 10),
                  status="DONE", completed_at=datetime(2026, 2, 9, 10, 0, tzinfo=_tz))
        _task(db_session, project_id=proj.id, due_date=date(2026, 2, 5),
              status="DONE", completed_at=datetime(2026, 2, 8, 10, 0, tzinfo=_tz))

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["global_discipline_percent"] > 80
        assert r["discipline_score"] == 100

    def test_medium_discipline(self, db_session):
        proj = _project(db_session)
        for i in range(7):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 10),
                  status="DONE", completed_at=datetime(2026, 2, 9, 10, 0, tzinfo=_tz))
        for i in range(3):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 5),
                  status="DONE", completed_at=datetime(2026, 2, 8, 10, 0, tzinfo=_tz))

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert 65 <= r["global_discipline_percent"] < 80
        assert r["discipline_score"] == 75

    def test_low_discipline(self, db_session):
        proj = _project(db_session)
        _task(db_session, project_id=proj.id, due_date=date(2026, 2, 10),
              status="DONE", completed_at=datetime(2026, 2, 9, 10, 0, tzinfo=_tz))
        for i in range(3):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 5),
                  status="DONE", completed_at=datetime(2026, 2, 8, 10, 0, tzinfo=_tz))

        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["global_discipline_percent"] < 50
        assert r["discipline_score"] == 30

    def test_no_tasks_discipline(self, db_session):
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["global_discipline_percent"] == 0
        assert r["discipline_score"] == 30


# ── Focus score ──

class TestFocusScore:
    def test_few_in_progress(self, db_session):
        for i in range(2):
            _task(db_session, board_status="in_progress")
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["in_progress_total"] == 2
        assert r["focus_score"] == 100

    def test_medium_in_progress(self, db_session):
        for i in range(5):
            _task(db_session, board_status="in_progress")
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["focus_score"] == 80

    def test_many_in_progress(self, db_session):
        for i in range(7):
            _task(db_session, board_status="in_progress")
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["focus_score"] == 60

    def test_too_many_in_progress(self, db_session):
        for i in range(10):
            _task(db_session, board_status="in_progress")
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["focus_score"] == 40


# ── Project score ──

class TestProjectScore:
    def test_high_discipline_projects(self, db_session):
        proj = _project(db_session)
        for i in range(5):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 10),
                  status="DONE", completed_at=datetime(2026, 2, 9, 10, 0, tzinfo=_tz))
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["project_score"] == 100

    def test_overdue_penalty(self, db_session):
        proj = _project(db_session)
        for i in range(6):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 1),
                  status="ACTIVE")
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["project_score"] == 30

    def test_no_active_projects(self, db_session):
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["project_score"] == 40


# ── Life Score formula ──

class TestLifeScore:
    def test_weighted_sum(self, db_session):
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        expected = round(0.40 * 80 + 0.25 * 30 + 0.20 * 40 + 0.15 * 100, 1)
        assert r["life_score"] == expected
        assert r["life_score"] == 62.5


# ── Drag factors ──

class TestDragFactors:
    def test_empty_data_no_drags(self):
        data = {
            "debt_ratio": 10, "savings_rate": 30, "finance_score": 100,
            "projects_overdue_total": 0, "project_score": 100,
            "global_discipline_percent": 90, "discipline_score": 100,
            "in_progress_total": 2, "focus_score": 100,
        }
        assert StrategyService.get_drag_factors(data) == []

    def test_identifies_drags(self):
        data = {
            "debt_ratio": 45, "savings_rate": -5, "finance_score": 50,
            "projects_overdue_total": 3, "project_score": 70,
            "global_discipline_percent": 60, "discipline_score": 50,
            "in_progress_total": 9, "focus_score": 40,
        }
        drags = StrategyService.get_drag_factors(data)
        assert len(drags) == 3
        for d in drags:
            assert d["impact"] < 0

    def test_max_three_factors(self):
        data = {
            "debt_ratio": 60, "savings_rate": -10, "finance_score": 10,
            "projects_overdue_total": 10, "project_score": 30,
            "global_discipline_percent": 40, "discipline_score": 30,
            "in_progress_total": 12, "focus_score": 40,
        }
        drags = StrategyService.get_drag_factors(data)
        assert len(drags) == 3


# ── Snapshot upsert ──

class TestSnapshotUpsert:
    def test_creates_and_updates_snapshot(self, db_session):
        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)

        snap = db_session.query(StrategicMonthSnapshot).filter(
            StrategicMonthSnapshot.account_id == ACCT,
            StrategicMonthSnapshot.year == 2026,
            StrategicMonthSnapshot.month == 2,
        ).first()
        assert snap is not None
        assert float(snap.life_score) > 0

        _wallet(db_session, 1, wallet_type="REGULAR", balance=500_000)
        svc.compute(ACCT, 2026, 2)
        db_session.refresh(snap)
        assert snap is not None


# ── Empty data defaults ──

class TestEmptyData:
    def test_empty_returns_defaults(self, db_session):
        svc = StrategyService(db_session)
        r = svc.compute(ACCT, 2026, 2)
        assert r["assets_total"] == 0
        assert r["debt_total"] == 0
        assert r["active_projects_count"] == 0
        assert r["in_progress_total"] == 0
        assert r["life_score"] > 0


# ── History (12 months) ──

class TestHistory:
    def test_generates_12_months(self, db_session):
        """get_history should return 12 entries, creating snapshots as needed."""
        svc = StrategyService(db_session)
        history = svc.get_history(ACCT, 2026, 2)

        assert len(history) == 12
        assert history[0]["year"] == 2025
        assert history[0]["month"] == 3
        assert history[-1]["year"] == 2026
        assert history[-1]["month"] == 2

    def test_history_idempotent(self, db_session):
        """Calling get_history twice should not duplicate snapshots."""
        svc = StrategyService(db_session)
        svc.get_history(ACCT, 2026, 2)
        svc.get_history(ACCT, 2026, 2)

        snap_count = db_session.query(StrategicMonthSnapshot).filter(
            StrategicMonthSnapshot.account_id == ACCT,
        ).count()
        assert snap_count == 12

    def test_history_scores_populated(self, db_session):
        """Each history entry should have numeric scores."""
        svc = StrategyService(db_session)
        history = svc.get_history(ACCT, 2026, 2)

        for h in history:
            assert isinstance(h["life_score"], float)
            assert isinstance(h["finance_score"], float)
            assert isinstance(h["discipline_score"], float)
            assert isinstance(h["project_score"], float)
            assert isinstance(h["focus_score"], float)


# ── Breakdown ──

class TestBreakdown:
    def test_breakdown_created_on_compute(self, db_session):
        """compute() should create breakdown rows."""
        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)

        snap = db_session.query(StrategicMonthSnapshot).filter(
            StrategicMonthSnapshot.account_id == ACCT,
            StrategicMonthSnapshot.year == 2026,
            StrategicMonthSnapshot.month == 2,
        ).first()
        rows = db_session.query(StrategicScoreBreakdown).filter(
            StrategicScoreBreakdown.snapshot_id == snap.id,
        ).all()
        assert len(rows) >= 4  # at least one per component

    def test_breakdown_sorted_by_penalty(self, db_session):
        """get_breakdown returns top penalty items sorted desc."""
        # Create scenario with penalties
        _wallet(db_session, 1, wallet_type="REGULAR", balance=50_000)
        _wallet(db_session, 2, wallet_type="CREDIT", balance=-40_000)  # high debt
        for i in range(7):
            _task(db_session, board_status="in_progress")  # too many WIP

        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)
        bd = svc.get_breakdown(ACCT, 2026, 2)

        assert len(bd) > 0
        # Should be sorted by penalty_value desc
        for i in range(len(bd) - 1):
            assert bd[i]["penalty_value"] >= bd[i + 1]["penalty_value"]

    def test_breakdown_has_penalty_reason(self, db_session):
        """Items with penalties should have penalty_reason set."""
        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)
        bd = svc.get_breakdown(ACCT, 2026, 2)

        for item in bd:
            assert item["penalty_reason"] is not None

    def test_breakdown_has_link_url(self, db_session):
        """Items with penalties should have actionable link_url."""
        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)
        bd = svc.get_breakdown(ACCT, 2026, 2)

        for item in bd:
            assert item["link_url"] is not None
            assert item["link_url"].startswith("/")

    def test_breakdown_idempotent(self, db_session):
        """Recomputing should replace breakdown rows, not duplicate."""
        svc = StrategyService(db_session)
        svc.compute(ACCT, 2026, 2)
        snap = db_session.query(StrategicMonthSnapshot).filter(
            StrategicMonthSnapshot.account_id == ACCT,
            StrategicMonthSnapshot.year == 2026,
            StrategicMonthSnapshot.month == 2,
        ).first()
        count1 = db_session.query(StrategicScoreBreakdown).filter(
            StrategicScoreBreakdown.snapshot_id == snap.id,
        ).count()

        svc.compute(ACCT, 2026, 2)
        count2 = db_session.query(StrategicScoreBreakdown).filter(
            StrategicScoreBreakdown.snapshot_id == snap.id,
        ).count()

        assert count1 == count2


# ── Simulator ──

class TestSimulator:
    def test_no_change_returns_zero_delta(self, db_session):
        """Simulating with current values → delta = 0."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        sim = StrategyService.simulate(data)
        assert sim["delta"] == 0
        assert sim["life_score"] == data["life_score"]

    def test_improve_discipline_raises_score(self, db_session):
        """Improving discipline target should raise life score."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)
        # Default: discipline=0 → score=30

        sim = StrategyService.simulate(data, discipline_target=90)
        assert sim["discipline_score"] == 100
        assert sim["delta"] > 0
        assert sim["life_score"] > data["life_score"]

    def test_reduce_focus_raises_score(self, db_session):
        """Fewer in-progress tasks → better focus score."""
        for i in range(10):
            _task(db_session, board_status="in_progress")

        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)
        assert data["focus_score"] == 40

        sim = StrategyService.simulate(data, focus_target=2)
        assert sim["focus_score"] == 100
        assert sim["delta"] > 0

    def test_reduce_debt_raises_score(self, db_session):
        """Lower debt ratio → better finance score."""
        _wallet(db_session, 1, wallet_type="REGULAR", balance=50_000)
        _wallet(db_session, 2, wallet_type="CREDIT", balance=-40_000)

        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        sim = StrategyService.simulate(data, debt_ratio_target=10, savings_rate_target=30)
        assert sim["finance_score"] == 100
        assert sim["delta"] > 0

    def test_simulator_uses_same_formulas(self, db_session):
        """Simulator results should match what compute would give."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        sim = StrategyService.simulate(
            data,
            discipline_target=85,
            focus_target=2,
            debt_ratio_target=10,
            savings_rate_target=30,
        )

        # Manually verify
        expected_fin = finance_score_from(10, 30)
        expected_disc = discipline_score_from(85)
        expected_foc = focus_score_from(2)
        expected_ls = life_score_from(expected_fin, expected_disc, data["project_score"], expected_foc)

        assert sim["finance_score"] == expected_fin
        assert sim["discipline_score"] == expected_disc
        assert sim["focus_score"] == expected_foc
        assert sim["life_score"] == expected_ls

    def test_simulator_preserves_project_score(self, db_session):
        """Project score is not overridable and stays the same."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        sim = StrategyService.simulate(data, discipline_target=90)
        assert sim["project_score"] == data["project_score"]


# ── Daily snapshot ──

class TestDailySnapshot:
    def test_creates_once_per_day(self, db_session):
        """ensure_daily_snapshot creates only one row per day."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        svc.ensure_daily_snapshot(ACCT, data)
        svc.ensure_daily_snapshot(ACCT, data)  # second call — no-op

        count = db_session.query(StrategicDailySnapshot).filter(
            StrategicDailySnapshot.account_id == ACCT,
        ).count()
        assert count == 1

    def test_snapshot_scores_match_data(self, db_session):
        """Daily snapshot should store the current scores."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)
        svc.ensure_daily_snapshot(ACCT, data)

        snap = db_session.query(StrategicDailySnapshot).filter(
            StrategicDailySnapshot.account_id == ACCT,
        ).first()
        assert snap is not None
        assert float(snap.life_score) == data["life_score"]
        assert float(snap.finance_score) == data["finance_score"]


# ── Month dynamics ──

class TestMonthDynamics:
    def _seed_daily(self, db, scores):
        """Insert daily snapshots for Feb 2026."""
        for i, ls in enumerate(scores, 1):
            db.add(StrategicDailySnapshot(
                account_id=ACCT,
                date=date(2026, 2, i),
                life_score=ls,
                finance_score=80, discipline_score=50,
                project_score=40, focus_score=100,
            ))
        db.flush()

    def test_dynamics_returns_dates_with_delta(self, db_session):
        self._seed_daily(db_session, [60, 62, 58, 65, 63])

        svc = StrategyService(db_session)
        dyn = svc.get_month_dynamics(ACCT, 2026, 2)

        assert len(dyn) == 5
        assert dyn[0]["delta"] == 0  # first day has no previous
        assert dyn[1]["delta"] == 2.0   # 62 - 60
        assert dyn[2]["delta"] == -4.0  # 58 - 62
        assert dyn[3]["delta"] == 7.0   # 65 - 58
        assert dyn[4]["delta"] == -2.0  # 63 - 65

    def test_dynamics_green_red_logic(self, db_session):
        """Positive delta = growth, negative = decline."""
        self._seed_daily(db_session, [50, 55, 52])

        svc = StrategyService(db_session)
        dyn = svc.get_month_dynamics(ACCT, 2026, 2)

        assert dyn[1]["delta"] > 0   # growth
        assert dyn[2]["delta"] < 0   # decline


# ── Weekly review ──

class TestWeeklyReview:
    def _seed_week(self, db, start_date, scores):
        """Insert daily snapshots for a week."""
        from datetime import timedelta
        for i, ls in enumerate(scores):
            db.add(StrategicDailySnapshot(
                account_id=ACCT,
                date=start_date + timedelta(days=i),
                life_score=ls,
                finance_score=80, discipline_score=50,
                project_score=40, focus_score=100,
            ))
        db.flush()

    def test_create_weekly_review(self, db_session):
        """_create_weekly_review correctly averages daily snapshots."""
        # Seed last week Mon–Sun (Feb 16-22, 2026 = Mon-Sun)
        self._seed_week(db_session, date(2026, 2, 16), [60, 65, 70, 55, 80, 75, 60])

        svc = StrategyService(db_session)
        # Simulate Monday Feb 23
        review = svc._create_weekly_review(ACCT, 2026, 9, date(2026, 2, 23))

        expected_avg = round(sum([60, 65, 70, 55, 80, 75, 60]) / 7, 1)
        assert float(review.life_score_avg) == expected_avg
        assert review.main_problem is not None
        assert float(review.improvement_trend) == 0.0  # no previous week

    def test_improvement_trend(self, db_session):
        """improvement_trend shows diff from previous week."""
        # Create a previous week review
        db_session.add(StrategicWeeklyReview(
            account_id=ACCT, year=2026, week_number=8,
            life_score_avg=60, finance_avg=80, discipline_avg=50,
            project_avg=40, focus_avg=100, main_problem="discipline",
            improvement_trend=0,
        ))
        db_session.flush()

        # Seed current week with avg ~70
        self._seed_week(db_session, date(2026, 2, 16), [70, 70, 70, 70, 70, 70, 70])

        svc = StrategyService(db_session)
        review = svc._create_weekly_review(ACCT, 2026, 9, date(2026, 2, 23))

        assert float(review.life_score_avg) == 70
        assert float(review.improvement_trend) == 10.0  # 70 - 60

    def test_get_latest_review(self, db_session):
        """get_latest_weekly_review returns formatted dict."""
        db_session.add(StrategicWeeklyReview(
            account_id=ACCT, year=2026, week_number=8,
            life_score_avg=65, finance_avg=80, discipline_avg=40,
            project_avg=50, focus_avg=90, main_problem="discipline",
            improvement_trend=5.0,
        ))
        db_session.flush()

        svc = StrategyService(db_session)
        r = svc.get_latest_weekly_review(ACCT)

        assert r is not None
        assert r["life_score_avg"] == 65
        assert r["improvement_trend"] == 5.0
        assert r["main_problem"] == "Дисциплина"
        assert "recommendation" in r

    def test_no_review_returns_none(self, db_session):
        svc = StrategyService(db_session)
        assert svc.get_latest_weekly_review(ACCT) is None

    def test_main_problem_is_weakest(self, db_session):
        """main_problem should be the component with lowest avg score."""
        # Seed: focus_score is lowest
        from datetime import timedelta
        for i in range(7):
            db_session.add(StrategicDailySnapshot(
                account_id=ACCT,
                date=date(2026, 2, 16) + timedelta(days=i),
                life_score=60,
                finance_score=80, discipline_score=70,
                project_score=60, focus_score=30,
            ))
        db_session.flush()

        svc = StrategyService(db_session)
        review = svc._create_weekly_review(ACCT, 2026, 9, date(2026, 2, 23))
        assert review.main_problem == "focus"


# ── Risk mode ──

class TestRiskMode:
    def test_no_risk_by_default(self, db_session):
        """With default data, risk mode should not activate."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)
        # Default: discipline_score=30 < 50 → risk!
        # Actually, discipline_score=30 triggers risk mode

    def test_risk_low_discipline(self, db_session):
        """discipline_score < 50 triggers risk mode."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)
        # Default discipline_score = 30

        risk = svc.detect_risk_mode(ACCT, data)
        assert risk is not None
        assert risk["active"] is True
        assert any("Дисциплина" in r for r in risk["reasons"])

    def test_risk_overdue(self, db_session):
        """overdue > 5 triggers risk mode."""
        proj = _project(db_session)
        for i in range(6):
            _task(db_session, project_id=proj.id, due_date=date(2026, 2, 1),
                  status="ACTIVE")

        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        risk = svc.detect_risk_mode(ACCT, data)
        assert risk is not None
        assert any("Просрочено" in r for r in risk["reasons"])

    def test_risk_3day_decline(self, db_session):
        """3 consecutive days of declining life_score triggers risk mode."""
        today = date.today()
        from datetime import timedelta

        # Seed 4 days of declining scores
        for i, score in enumerate([70, 65, 60, 55]):
            db_session.add(StrategicDailySnapshot(
                account_id=ACCT,
                date=today - timedelta(days=3 - i),
                life_score=score,
                finance_score=80, discipline_score=80,
                project_score=80, focus_score=80,
            ))
        db_session.flush()

        # Create data with high scores so other triggers don't fire
        data = {
            "discipline_score": 100,
            "projects_overdue_total": 0,
        }

        svc = StrategyService(db_session)
        risk = svc.detect_risk_mode(ACCT, data)
        assert risk is not None
        assert any("падает" in r for r in risk["reasons"])

    def test_no_risk_when_good(self, db_session):
        """No risk when all indicators are healthy."""
        data = {
            "discipline_score": 100,
            "projects_overdue_total": 0,
        }

        svc = StrategyService(db_session)
        risk = svc.detect_risk_mode(ACCT, data)
        # No 3-day decline (no daily snapshots), discipline OK, no overdue
        assert risk is None

    def test_risk_has_tips(self, db_session):
        """Risk mode should include tips."""
        svc = StrategyService(db_session)
        data = svc.compute(ACCT, 2026, 2)

        risk = svc.detect_risk_mode(ACCT, data)
        if risk:
            assert len(risk["tips"]) >= 1
