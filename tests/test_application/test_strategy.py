"""
Tests for StrategyService — Life Score computation, history, breakdown, simulator.
"""
import pytest
from datetime import datetime, date, timezone
from decimal import Decimal

from app.infrastructure.db.models import (
    WalletBalance, TransactionFeed, ProjectModel, TaskModel,
    StrategicMonthSnapshot, StrategicScoreBreakdown,
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
