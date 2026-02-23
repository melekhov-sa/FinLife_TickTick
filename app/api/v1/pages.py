"""
SSR pages - server-side rendered HTML pages
"""
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date, timedelta, timezone
from urllib.parse import quote
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_

from app.api.deps import get_db, require_user
from app.infrastructure.db.models import (
    User, EventLog,
    WalletBalance, WalletFolder, CategoryInfo, TransactionFeed,
    WorkCategory, TaskModel, HabitModel, HabitOccurrence,
    TaskTemplateModel, TaskOccurrence,
    OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel,
    CalendarEventModel, EventOccurrenceModel, EventFilterPresetModel,
    SubscriptionModel, SubscriptionMemberModel, SubscriptionCoverageModel,
    ContactModel, WishModel, TaskPresetModel,
    TaskRescheduleReason, TaskDueChangeLog,
    GoalInfo, GoalWalletBalance,
    BudgetLine, BudgetGoalPlan, BudgetGoalWithdrawalPlan,
    ProjectModel,
    ArticleModel, ArticleLinkModel,
)
from app.application.wallets import CreateWalletUseCase, RenameWalletUseCase, ArchiveWalletUseCase, UnarchiveWalletUseCase, WalletValidationError
from app.application.categories import (
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    EnsureSystemCategoriesUseCase,
    ArchiveCategoryUseCase,
    UnarchiveCategoryUseCase,
    ListCategoriesService,
    CategoryValidationError
)
from app.application.transactions import CreateTransactionUseCase, UpdateTransactionUseCase, TransactionValidationError
from app.application.work_categories import CreateWorkCategoryUseCase, UpdateWorkCategoryUseCase, ArchiveWorkCategoryUseCase, UnarchiveWorkCategoryUseCase, WorkCategoryValidationError
from app.application.tasks_usecases import CreateTaskUseCase, CompleteTaskUseCase, ArchiveTaskUseCase, UncompleteTaskUseCase, UpdateTaskUseCase, TaskValidationError
from app.domain.task_due_spec import DueSpecValidationError, ReminderSpecValidationError
from app.application.habits import (
    CreateHabitUseCase, ArchiveHabitUseCase, UnarchiveHabitUseCase,
    ToggleHabitOccurrenceUseCase, CompleteHabitOccurrenceUseCase,
    SkipHabitOccurrenceUseCase, ResetHabitOccurrenceUseCase,
    HabitValidationError,
    get_today_habits, get_habits_grid, get_habits_analytics,
    get_global_heatmap, get_recent_milestones,
)
from app.application.task_templates import CreateTaskTemplateUseCase, CompleteTaskOccurrenceUseCase, SkipTaskOccurrenceUseCase, UncompleteTaskOccurrenceUseCase, TaskTemplateValidationError
from app.application.operation_templates import (
    CreateOperationTemplateUseCase, UpdateOperationTemplateUseCase,
    ArchiveOperationTemplateUseCase, UnarchiveOperationTemplateUseCase,
    ConfirmOperationOccurrenceUseCase, SkipOperationOccurrenceUseCase,
    OperationTemplateValidationError,
)
from app.application.occurrence_generator import OccurrenceGenerator
from app.application.events import (
    CreateEventUseCase, UpdateEventUseCase, DeactivateEventUseCase,
    ReactivateEventUseCase, CreateEventOccurrenceUseCase, UpdateEventOccurrenceUseCase,
    CancelEventOccurrenceUseCase,
    EventValidationError, validate_event_form, rebuild_event_occurrences,
)
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase, UpdateRecurrenceRuleUseCase
from app.application.budget import (
    EnsureBudgetMonthUseCase,
    CreateBudgetVariantUseCase, AttachBudgetDataUseCase, ArchiveBudgetVariantUseCase,
    get_active_variant, get_all_variants, has_orphan_budget_data,
    SaveBudgetPlanUseCase, SaveGoalPlansUseCase, SaveGoalWithdrawalPlansUseCase,
    CopyBudgetPlanUseCase, CopyManualPlanForwardUseCase,
    SaveAsTemplateUseCase, ApplyTemplateToPeriodUseCase,
    has_template, has_previous_period_plan, get_previous_period,
    build_budget_view, BudgetViewService, swap_budget_position,
    BudgetMonth, BudgetVariant, BudgetValidationError,
    get_allowed_granularities, clamp_granularity,
    GRANULARITY_LABELS,
    get_hidden_category_ids, save_hidden_category_ids,
    get_hidden_goal_ids, save_hidden_goal_ids,
    get_hidden_withdrawal_goal_ids, save_hidden_withdrawal_goal_ids,
)
from app.application.budget_matrix import BudgetMatrixService, RANGE_LIMITS
from app.application.budget_report import BudgetReportService
from app.application.plan import build_plan_view
from app.application.dashboard import DashboardService
from app.application.subscriptions import (
    CreateSubscriptionUseCase, UpdateSubscriptionUseCase,
    ArchiveSubscriptionUseCase, UnarchiveSubscriptionUseCase,
    AddSubscriptionMemberUseCase, ArchiveMemberUseCase, UnarchiveMemberUseCase, UpdateMemberPaymentUseCase,
    CreateSubscriptionCoverageUseCase, CreateInitialCoverageUseCase,
    ExtendSubscriptionUseCase, CompensateSubscriptionUseCase,
    SubscriptionValidationError,
    validate_coverage_before_transaction, compute_subscription_detail,
    compute_subscriptions_overview, compute_subscription_analytics,
)
from app.application.contacts import (
    CreateContactUseCase, UpdateContactUseCase,
    ArchiveContactUseCase, UnarchiveContactUseCase,
    ContactValidationError,
)
from app.application.wishes import (
    CreateWishUseCase, UpdateWishUseCase, CompleteWishesUseCase,
    WishValidationError,
)
from app.application.wishes_service import WishesService
from app.application.goals import CreateGoalUseCase, UpdateGoalUseCase, GoalValidationError
from app.application.xp import XpService
from app.application.activity import ActivityReadService
from app.application.profile import ProfileService, get_level_title
from app.application.xp_history import XpHistoryService, XP_REASON_FILTER_OPTIONS
from app.application.projects import (
    CreateProjectUseCase, UpdateProjectUseCase, ChangeProjectStatusUseCase,
    DeleteProjectUseCase, AssignTaskToProjectUseCase, ChangeTaskBoardStatusUseCase,
    CreateTaskInProjectUseCase,
    CreateProjectTagUseCase, UpdateProjectTagUseCase, DeleteProjectTagUseCase,
    AddTagToTaskUseCase, RemoveTagFromTaskUseCase,
    ProjectReadService, ProjectValidationError,
    PROJECT_STATUSES, BOARD_STATUSES, TAG_COLORS,
)
from app.application.knowledge import (
    CreateArticleUseCase, UpdateArticleUseCase, DeleteArticleUseCase,
    AttachArticleToProjectUseCase, DetachArticleFromProjectUseCase,
    KnowledgeReadService, KnowledgeValidationError,
    ARTICLE_TYPES, ARTICLE_STATUSES,
)
from app.readmodels.projectors.xp import preview_task_xp
from app.utils.validation import validate_and_normalize_amount


router = APIRouter(tags=["pages"])

# Templates
templates_dir = Path(__file__).parent.parent.parent.parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))

# Register money formatting globals for all templates
from app.utils.money import format_money, format_money2, currency_label
templates.env.globals["format_money"] = format_money
templates.env.globals["format_money2"] = format_money2
templates.env.globals["currency_label"] = currency_label

# Analytics (Microsoft Clarity) — expose to all templates
from app.config import get_settings as _get_settings
_s = _get_settings()
templates.env.globals["clarity_project_id"] = _s.CLARITY_PROJECT_ID if _s.CLARITY_ENABLED else ""

# Web Push (VAPID) — expose public key to all templates
templates.env.globals["vapid_public_key"] = _s.VAPID_PUBLIC_KEY

# Markdown filter for knowledge base articles
import markdown as _md
from markupsafe import Markup as _Markup

def _markdown_filter(text: str) -> _Markup:
    if not text:
        return _Markup("")
    return _Markup(_md.markdown(text, extensions=["fenced_code", "tables", "nl2br"]))

templates.env.filters["markdown"] = _markdown_filter


def _resolve_current_page(request: Request) -> str:
    """Map request URL path to a sidebar page-key string.

    Used as a Jinja2 global: {{ current_page(request) }}
    The sidebar partial calls it once and does only equality comparisons.
    """
    path = request.url.path
    if path in ("/", ""):
        return "dashboard"
    _PREFIX_MAP = [
        ("/wallets",          "wallets"),
        ("/goals",            "goals"),
        ("/categories",       "categories"),
        ("/transactions",     "transactions"),
        ("/budget",           "budget"),
        ("/plan",             "plan"),
        ("/tasks",            "tasks"),
        ("/projects",         "projects"),
        ("/habits",           "habits"),
        ("/planned-ops",      "planned-ops"),
        ("/wishes",           "wishes"),
        ("/subscriptions",    "subscriptions"),
        ("/contacts",         "contacts"),
        ("/events",           "events"),
        ("/task-categories",  "task-categories"),
        ("/task-presets",     "task-presets"),
        ("/task-reschedule-reasons", "task-reschedule-reasons"),
        ("/knowledge",        "knowledge"),
        ("/profile",          "profile"),
        ("/admin",            "admin"),
    ]
    for prefix, key in _PREFIX_MAP:
        if path == prefix or path.startswith(prefix + "/"):
            return key
    return ""


templates.env.globals["current_page"] = _resolve_current_page


# ---------------------------------------------------------------------------
# Theme system
# ---------------------------------------------------------------------------

VALID_THEMES: frozenset[str] = frozenset({
    "graphite-emerald-light",
    "graphite-emerald-dark",
    "deep-blue-light",
    "deep-blue-dark",
    "architect-neutral-light",
    "architect-neutral-dark",
})

_DEFAULT_THEME = "graphite-emerald-light"


def _get_user_theme(request: Request) -> str:
    """Return the current user's theme from the session (Jinja2 global).

    Falls back to the default light theme if the session is empty or contains
    an unrecognised value (e.g. the old 'dark' key from the previous system).
    """
    theme = request.session.get("user_theme", _DEFAULT_THEME)
    return theme if theme in VALID_THEMES else _DEFAULT_THEME


templates.env.globals["user_theme"] = _get_user_theme


# === Dashboard ===

MONTH_NAMES_RU = {
    1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
    5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
    9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
}


@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    """Главная страница - Dashboard V2"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Ensure system categories exist
    EnsureSystemCategoriesUseCase(db).execute(account_id=user_id, actor_user_id=user_id)

    # Generate occurrences lazily
    OccurrenceGenerator(db).generate_all(user_id)

    today = date.today()
    svc = DashboardService(db)

    # 1. Today block
    today_block = svc.get_today_block(user_id, today)

    # 9. Focus data for #dash-focus
    _FOCUS_MAX_TASKS = 5
    _FOCUS_MAX_EVENTS = 3
    _overdue_all = today_block["overdue"]
    _active_all = today_block["active"]
    _done_all = today_block["done"]
    _events_all = today_block["events"]
    focus_overdue = [i for i in _overdue_all if i["kind"] in ("task", "task_occ")]
    # Today's active tasks (todo)
    focus_today_todo_all = [i for i in _active_all if i["kind"] in ("task", "task_occ")]
    focus_today_todo = focus_today_todo_all[:_FOCUS_MAX_TASKS]
    focus_today_todo_overflow = len(focus_today_todo_all) > _FOCUS_MAX_TASKS
    # Today's completed tasks (done)
    focus_today_done_all = [i for i in _done_all if i["kind"] in ("task", "task_occ")]
    focus_today_done = focus_today_done_all[:_FOCUS_MAX_TASKS]
    focus_today_done_overflow = len(focus_today_done_all) > _FOCUS_MAX_TASKS
    # Events today (separate, not in progress)
    focus_today_events = _events_all[:_FOCUS_MAX_EVENTS]
    focus_today_events_overflow = len(_events_all) > _FOCUS_MAX_EVENTS
    # Habits (active only, as before)
    focus_habits_all = [i for i in _active_all if i["kind"] == "habit"]
    focus_habits = focus_habits_all[:_FOCUS_MAX_TASKS]
    focus_habits_overflow = len(focus_habits_all) > _FOCUS_MAX_TASKS
    # Progress: tasks only (events excluded)
    focus_done_count = today_block["progress"]["done"]
    focus_total_count = today_block["progress"]["total"]

    # 2. Upcoming payments
    upcoming_payments = svc.get_upcoming_payments(user_id, today, limit=3)

    # 3. Habit heatmap (15 days, 3 rows x 5 cols)
    habit_heatmap = svc.get_habit_heatmap(user_id, today, days=15)

    # 4. Financial summary (legacy grouped view, kept for compatibility)
    fin = svc.get_financial_summary(user_id, today)
    current_month = f"{MONTH_NAMES_RU[today.month]} {today.year}"

    # 5. Wishes this month
    wishes_this_month = svc.get_wishes_this_month(user_id, today)

    # 6. Finance state summary (wallet totals + Δ30d + monthly result)
    fin_state = svc.get_fin_state_summary(user_id, today)

    # 7. XP summary for #dash-level
    _xp = XpService(db).get_xp_profile(user_id)
    dash_xp = {
        "level":            _xp["level"],
        "level_title":      get_level_title(_xp["level"]),
        "current_level_xp": _xp["current_level_xp"],
        "xp_to_next_level": _xp["xp_to_next_level"],
        "total_level_target": _xp["current_level_xp"] + _xp["xp_to_next_level"],
        "percent_progress": _xp["percent_progress"],   # already 0–100
        "xp_this_month":    _xp["xp_this_month"],
    }

    # 8. Activity summary for #dash-activity
    MSK = timezone(timedelta(hours=3))
    today_msk = datetime.now(MSK).date()
    _act = ActivityReadService(db).get_activity_summary(user_id, today_msk)
    _td = _act["trend_delta"]
    dash_activity = {
        "activity_index":  _act["activity_index"],
        "trend_delta":     _td,
        "trend_sign":      "up" if _td > 0 else ("down" if _td < 0 else "zero"),
        "trend_abs":       abs(_td),
        "points_7d":       _act["points_7d"],
        "points_prev_7d":  _act["points_prev_7d"],
    }

    # 10. Event feed for #dash-feed (today_msk already defined in step 8)
    feed_groups = svc.get_dashboard_feed(user_id, today_msk)

    # 11. Wallets for quick-op modal
    dash_wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False,
    ).all()

    # 12. Categories for quick-op modal
    dash_categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
    ).order_by(CategoryInfo.title).all()

    # 13. Work categories + reminder presets for quick-task modal
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()

    from app.infrastructure.db.models import UserReminderTimePreset
    from app.application.reminder_presets import ReminderPresetsService
    reminder_presets = db.query(UserReminderTimePreset).filter(
        UserReminderTimePreset.account_id == user_id,
    ).order_by(UserReminderTimePreset.sort_order).all()
    if not reminder_presets:
        ReminderPresetsService(db).seed_defaults(user_id)
        reminder_presets = db.query(UserReminderTimePreset).filter(
            UserReminderTimePreset.account_id == user_id,
        ).order_by(UserReminderTimePreset.sort_order).all()

    # 14. Task presets for quick-task modal
    _dash_user = db.query(User).filter(User.id == user_id).first()
    _dash_enable_tt = _dash_user.enable_task_templates if _dash_user else False
    _dash_task_presets = []
    if _dash_enable_tt:
        _dash_task_presets = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.is_active == True,
        ).order_by(TaskPresetModel.sort_order, TaskPresetModel.id).all()

    # 15. Expiring subscriptions (SELF only, next 30 days)
    _sub_deadline = today + timedelta(days=30)
    expiring_subs_raw = db.query(SubscriptionModel).filter(
        SubscriptionModel.account_id == user_id,
        SubscriptionModel.is_archived == False,
        SubscriptionModel.paid_until_self.isnot(None),
        SubscriptionModel.paid_until_self >= today,
        SubscriptionModel.paid_until_self <= _sub_deadline,
    ).order_by(SubscriptionModel.paid_until_self).limit(5).all()

    expiring_subs = []
    for s in expiring_subs_raw:
        days_left = (s.paid_until_self - today).days
        expiring_subs.append({
            "id": s.id,
            "name": s.name,
            "paid_until": s.paid_until_self,
            "days_left": days_left,
        })

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "today": today,
        # Today block (kept for backward-compat; new template uses focus_* vars)
        "overdue_items": today_block["overdue"],
        "active_items": today_block["active"],
        "done_items": today_block["done"],
        "progress": today_block["progress"],
        # Focus data for #dash-focus
        "focus_overdue": focus_overdue,
        "focus_today_todo": focus_today_todo,
        "focus_today_todo_overflow": focus_today_todo_overflow,
        "focus_today_done": focus_today_done,
        "focus_today_done_overflow": focus_today_done_overflow,
        "focus_today_events": focus_today_events,
        "focus_today_events_overflow": focus_today_events_overflow,
        "focus_habits": focus_habits,
        "focus_habits_overflow": focus_habits_overflow,
        "focus_done_count": focus_done_count,
        "focus_total_count": focus_total_count,
        # Event feed for #dash-feed
        "feed_groups": feed_groups,
        # Upcoming payments
        "upcoming_payments": upcoming_payments,
        # Habit heatmap
        "habit_heatmap": habit_heatmap,
        # Financial summary (month name for headings)
        "current_month": current_month,
        "fin_by_currency": fin,
        # Finance state card (wallet totals by type + Δ30d + monthly result)
        "fin_state": fin_state,
        # XP level card
        "dash_xp": dash_xp,
        # Activity index card
        "dash_activity": dash_activity,
        # Wishes
        "wishes_this_month": wishes_this_month,
        # Wallets + categories for quick-op modal
        "dash_wallets": dash_wallets,
        "dash_categories": dash_categories,
        # Work categories + reminder presets for quick-task modal
        "work_categories": work_categories,
        "reminder_presets": reminder_presets,
        # Task presets for quick-task modal
        "enable_task_templates": _dash_enable_tt,
        "task_presets": _dash_task_presets,
        # Expiring subscriptions
        "expiring_subs": expiring_subs,
    })


# === Wallets ===

@router.get("/wallets", response_class=HTMLResponse)
def wallets_page(request: Request, db: Session = Depends(get_db)):
    """Страница управления кошельками"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id
    ).all()

    folders = db.query(WalletFolder).filter(
        WalletFolder.account_id == user_id
    ).order_by(WalletFolder.position, WalletFolder.id).all()

    # Calculate dynamics for each wallet
    thirty_days_ago = datetime.now() - timedelta(days=30)

    wallet_data = []
    for w in wallets:
        # Count operations in last 30 days
        ops_count = db.query(func.count(TransactionFeed.transaction_id)).filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.occurred_at >= thirty_days_ago,
            or_(
                TransactionFeed.wallet_id == w.wallet_id,
                TransactionFeed.from_wallet_id == w.wallet_id,
                TransactionFeed.to_wallet_id == w.wallet_id
            )
        ).scalar() or 0

        # Calculate balance 30 days ago by replaying transactions
        # Get all transactions after 30 days ago
        recent_txs = db.query(TransactionFeed).filter(
            TransactionFeed.account_id == user_id,
            TransactionFeed.occurred_at >= thirty_days_ago,
            or_(
                TransactionFeed.wallet_id == w.wallet_id,
                TransactionFeed.from_wallet_id == w.wallet_id,
                TransactionFeed.to_wallet_id == w.wallet_id
            )
        ).all()

        # Calculate balance change in last 30 days
        balance_change = Decimal("0")
        for tx in recent_txs:
            if tx.operation_type == "INCOME" and tx.wallet_id == w.wallet_id:
                balance_change += tx.amount
            elif tx.operation_type == "EXPENSE" and tx.wallet_id == w.wallet_id:
                balance_change -= tx.amount
            elif tx.operation_type == "TRANSFER":
                if tx.from_wallet_id == w.wallet_id:
                    balance_change -= tx.amount
                if tx.to_wallet_id == w.wallet_id:
                    balance_change += tx.amount

        balance_30d_ago = w.balance - balance_change

        wallet_data.append({
            "wallet": w,
            "operations_count_30d": ops_count,
            "balance_30d_ago": balance_30d_ago,
            "delta_30d": balance_change
        })

    # Calculate summary by wallet type + currency
    _summary_map: dict[tuple, dict] = {}
    _type_order = {"REGULAR": 0, "CREDIT": 1, "SAVINGS": 2}

    for wd in wallet_data:
        w = wd["wallet"]
        if not w.is_archived:
            key = (w.wallet_type, w.currency)
            if key not in _summary_map:
                _summary_map[key] = {
                    "wallet_type": w.wallet_type,
                    "currency": w.currency,
                    "count": 0,
                    "total": Decimal("0"),
                }
            _summary_map[key]["count"] += 1
            _summary_map[key]["total"] += w.balance

    summary = sorted(
        _summary_map.values(),
        key=lambda s: (_type_order.get(s["wallet_type"], 9), s["currency"]),
    )

    # Group active wallets by folder
    folder_map = {f.id: f for f in folders}
    _folder_groups: dict[int, list] = {}  # folder_id -> [wd]
    ungrouped_wallets = []
    for wd in wallet_data:
        if wd["wallet"].is_archived:
            continue
        fid = wd["wallet"].folder_id
        if fid and fid in folder_map:
            _folder_groups.setdefault(fid, []).append(wd)
        else:
            ungrouped_wallets.append(wd)

    # Build ordered list of folder groups with aggregate stats
    grouped_wallets = []
    for fid in sorted(_folder_groups.keys(), key=lambda x: (folder_map[x].position, x)):
        wds = _folder_groups[fid]
        currencies = {wd["wallet"].currency for wd in wds}
        same_currency = len(currencies) == 1
        currency = list(currencies)[0] if same_currency else None
        total_balance = sum(wd["wallet"].balance for wd in wds) if same_currency else None
        total_delta_30d = sum(wd["delta_30d"] for wd in wds) if same_currency else None
        total_ops_30d = sum(wd["operations_count_30d"] for wd in wds)
        last_ops = [wd["wallet"].last_operation_at for wd in wds if wd["wallet"].last_operation_at]
        grouped_wallets.append({
            "folder": folder_map[fid],
            "wallets": wds,
            "currency": currency,
            "total_balance": total_balance,
            "total_delta_30d": total_delta_30d,
            "total_ops_30d": total_ops_30d,
            "last_op_at": max(last_ops) if last_ops else None,
        })

    return templates.TemplateResponse("wallets.html", {
        "request": request,
        "wallet_data": wallet_data,
        "summary": summary,
        "folders": folders,
        "grouped_wallets": grouped_wallets,
        "ungrouped_wallets": ungrouped_wallets,
    })


@router.get("/wallets/new", response_class=HTMLResponse)
def wallet_new_page(request: Request):
    """Страница создания кошелька"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    return templates.TemplateResponse("wallet_form.html", {
        "request": request,
        "mode": "new"
    })


@router.post("/wallets/create", response_class=HTMLResponse)
def create_wallet_form(
    request: Request,
    title: str = Form(...),
    currency: str = Form(...),
    wallet_type: str = Form("REGULAR"),
    initial_balance: str = Form("0"),
    db: Session = Depends(get_db)
):
    """Обработка формы создания кошелька"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        # Валидация и нормализация баланса (принимаем точку и запятую, макс 2 знака)
        normalized_balance = validate_and_normalize_amount(initial_balance, max_decimal_places=2)

        use_case = CreateWalletUseCase(db)
        use_case.execute(
            account_id=user_id,
            title=title,
            currency=currency,
            wallet_type=wallet_type,
            initial_balance=normalized_balance,
            actor_user_id=user_id
        )
        return RedirectResponse("/wallets", status_code=302)
    except IntegrityError as e:
        # Откатить транзакцию перед новым запросом
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id
        ).all()
        return templates.TemplateResponse("wallets.html", {
            "request": request,
            "wallets": wallets,
            "error": "Кошелек уже создается. Пожалуйста, обновите страницу."
        })
    except Exception as e:
        # Откатить транзакцию перед новым запросом
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id
        ).all()
        return templates.TemplateResponse("wallets.html", {
            "request": request,
            "wallets": wallets,
            "error": str(e)
        })


@router.post("/wallets/{wallet_id}/rename", response_class=HTMLResponse)
def rename_wallet_form(
    request: Request,
    wallet_id: int,
    title: str = Form(...),
    db: Session = Depends(get_db)
):
    """Обработка формы переименования кошелька"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        use_case = RenameWalletUseCase(db)
        use_case.execute(
            wallet_id=wallet_id,
            account_id=user_id,
            title=title,
            actor_user_id=user_id
        )
        return RedirectResponse("/wallets", status_code=302)
    except Exception as e:
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id
        ).all()
        return templates.TemplateResponse("wallets.html", {
            "request": request,
            "wallets": wallets,
            "error": str(e)
        })


@router.post("/wallets/{wallet_id}/archive", response_class=HTMLResponse)
def archive_wallet_form(
    request: Request,
    wallet_id: int,
    db: Session = Depends(get_db)
):
    """Архивировать кошелёк"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        use_case = ArchiveWalletUseCase(db)
        use_case.execute(
            wallet_id=wallet_id,
            account_id=user_id,
            actor_user_id=user_id
        )
        return RedirectResponse("/wallets", status_code=302)
    except Exception as e:
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id
        ).all()
        return templates.TemplateResponse("wallets.html", {
            "request": request,
            "wallets": wallets,
            "error": str(e)
        })


@router.post("/wallets/{wallet_id}/unarchive", response_class=HTMLResponse)
def unarchive_wallet_form(
    request: Request,
    wallet_id: int,
    db: Session = Depends(get_db)
):
    """Восстановить кошелёк из архива"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        use_case = UnarchiveWalletUseCase(db)
        use_case.execute(
            wallet_id=wallet_id,
            account_id=user_id,
            actor_user_id=user_id
        )
        return RedirectResponse("/wallets", status_code=302)
    except Exception as e:
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id
        ).all()
        return templates.TemplateResponse("wallets.html", {
            "request": request,
            "wallets": wallets,
            "error": str(e)
        })


# === Wallet Balance Actualization ===

@router.post("/wallets/{wallet_id}/actualize-balance", response_class=HTMLResponse)
def actualize_wallet_balance(
    request: Request,
    wallet_id: int,
    target_balance: str = Form(...),
    db: Session = Depends(get_db)
):
    """Актуализировать баланс кошелька — создать корректирующую операцию"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        target = Decimal(target_balance)
    except Exception:
        return RedirectResponse(
            "/wallets?error=Некорректное+значение+баланса", status_code=302
        )

    try:
        result = CreateTransactionUseCase(db).actualize_balance(
            account_id=user_id,
            wallet_id=wallet_id,
            target_balance=target,
            actor_user_id=user_id,
        )
    except TransactionValidationError as e:
        return RedirectResponse(f"/wallets?error={quote(str(e))}", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/wallets?error={quote(str(e))}", status_code=302)

    if result["action"] == "none":
        return RedirectResponse(
            f"/wallets?success={quote('Баланс уже актуален')}", status_code=302
        )

    action_label = "доход" if result["action"] == "income" else "расход"
    msg = f"Баланс актуализирован: создан {action_label} на {result['delta']}"
    return RedirectResponse(f"/wallets?success={quote(msg)}", status_code=302)


# === Wallet Folders ===

@router.post("/wallets/folders/create", response_class=HTMLResponse)
def create_wallet_folder(
    request: Request,
    title: str = Form(...),
    wallet_type: str = Form(...),
    db: Session = Depends(get_db)
):
    """Создать папку для кошельков"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    title = title.strip()
    if not title:
        return RedirectResponse("/wallets?error=Название+папки+не+может+быть+пустым", status_code=302)
    if wallet_type not in ("REGULAR", "CREDIT", "SAVINGS"):
        return RedirectResponse("/wallets?error=Неверный+тип+кошелька", status_code=302)
    folder = WalletFolder(account_id=user_id, title=title, wallet_type=wallet_type)
    db.add(folder)
    db.commit()
    return RedirectResponse("/wallets", status_code=302)


@router.post("/wallets/folders/{folder_id}/rename", response_class=HTMLResponse)
def rename_wallet_folder(
    request: Request,
    folder_id: int,
    title: str = Form(...),
    db: Session = Depends(get_db)
):
    """Переименовать папку кошельков"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    folder = db.query(WalletFolder).filter(
        WalletFolder.id == folder_id, WalletFolder.account_id == user_id
    ).first()
    if folder:
        title = title.strip()
        if title:
            folder.title = title
            db.commit()
    return RedirectResponse("/wallets", status_code=302)


@router.post("/wallets/folders/{folder_id}/delete", response_class=HTMLResponse)
def delete_wallet_folder(
    request: Request,
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Удалить папку (кошельки перемещаются в «Без папки»)"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    folder = db.query(WalletFolder).filter(
        WalletFolder.id == folder_id, WalletFolder.account_id == user_id
    ).first()
    if folder:
        # Unassign wallets from this folder
        db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id,
            WalletBalance.folder_id == folder_id
        ).update({"folder_id": None})
        db.delete(folder)
        db.commit()
    return RedirectResponse("/wallets", status_code=302)


@router.post("/wallets/{wallet_id}/set-folder", response_class=HTMLResponse)
def set_wallet_folder(
    request: Request,
    wallet_id: int,
    folder_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """Назначить кошелёк в папку (folder_id=0 означает «без папки»)"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    wallet = db.query(WalletBalance).filter(
        WalletBalance.wallet_id == wallet_id,
        WalletBalance.account_id == user_id
    ).first()
    if wallet:
        if folder_id > 0:
            # Validate folder belongs to user and matches wallet type
            folder = db.query(WalletFolder).filter(
                WalletFolder.id == folder_id, WalletFolder.account_id == user_id
            ).first()
            if folder and folder.wallet_type == wallet.wallet_type:
                wallet.folder_id = folder.id
            # else: type mismatch or not found — ignore silently
        else:
            wallet.folder_id = None
        db.commit()
    return RedirectResponse("/wallets", status_code=302)


# === Goals ===


@router.get("/goals", response_class=HTMLResponse)
def goals_list_page(request: Request, db: Session = Depends(get_db)):
    """Страница списка целей"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Load all active goals
    all_goals = db.query(GoalInfo).filter(
        GoalInfo.account_id == user_id,
        GoalInfo.is_archived == False
    ).order_by(GoalInfo.is_system.asc(), GoalInfo.updated_at.desc()).all()

    # Aggregate goal balances in ONE query (no N+1)
    goal_ids = [g.goal_id for g in all_goals]
    gwb_agg = {}
    wallet_counts = {}
    if goal_ids:
        rows = (
            db.query(
                GoalWalletBalance.goal_id,
                func.sum(GoalWalletBalance.amount).label("total"),
                func.count(GoalWalletBalance.wallet_id).label("cnt"),
            )
            .filter(GoalWalletBalance.goal_id.in_(goal_ids))
            .group_by(GoalWalletBalance.goal_id)
            .all()
        )
        for row in rows:
            gwb_agg[row.goal_id] = row.total or Decimal("0")
            wallet_counts[row.goal_id] = row.cnt

    goals = []
    for g in all_goals:
        fact = gwb_agg.get(g.goal_id, Decimal("0"))
        percent = 0
        if g.target_amount and g.target_amount > 0:
            percent = int(fact * 100 / g.target_amount)
        goals.append({
            "goal": g,
            "fact": fact,
            "percent": percent,
            "wallet_count": wallet_counts.get(g.goal_id, 0),
        })

    return templates.TemplateResponse("goals_list.html", {
        "request": request,
        "goals": goals,
    })


@router.get("/goals/new", response_class=HTMLResponse)
def goal_new_page(request: Request):
    """Форма создания цели"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    return templates.TemplateResponse("goal_form.html", {
        "request": request,
        "mode": "new",
        "goal": None,
    })


@router.post("/goals/new", response_class=HTMLResponse)
def goal_new_submit(
    request: Request,
    title: str = Form(...),
    currency: str = Form("RUB"),
    target_amount: str = Form(""),
    db: Session = Depends(get_db),
):
    """Создать цель"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    ta = target_amount.strip() or None

    try:
        goal_id = CreateGoalUseCase(db).execute(
            account_id=user_id,
            title=title,
            currency=currency,
            target_amount=ta,
            actor_user_id=user_id,
        )
        return RedirectResponse(f"/goals/{goal_id}", status_code=302)
    except (GoalValidationError, Exception) as e:
        db.rollback()
        return templates.TemplateResponse("goal_form.html", {
            "request": request,
            "mode": "new",
            "goal": None,
            "error": str(e),
        })


@router.get("/goals/{goal_id}", response_class=HTMLResponse)
def goal_detail_page(
    request: Request,
    goal_id: int,
    db: Session = Depends(get_db),
):
    """Страница детали цели"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    goal = db.query(GoalInfo).filter(
        GoalInfo.goal_id == goal_id,
        GoalInfo.account_id == user_id,
    ).first()

    if not goal:
        return RedirectResponse("/goals", status_code=302)

    # Wallet breakdown
    gwb_rows = (
        db.query(GoalWalletBalance, WalletBalance.title.label("wallet_title"))
        .join(WalletBalance, WalletBalance.wallet_id == GoalWalletBalance.wallet_id)
        .filter(
            GoalWalletBalance.goal_id == goal_id,
            GoalWalletBalance.amount != 0,
        )
        .order_by(GoalWalletBalance.amount.desc())
        .all()
    )

    wallet_breakdown = []
    fact = Decimal("0")
    for gwb, wallet_title in gwb_rows:
        wallet_breakdown.append({
            "wallet_title": wallet_title,
            "amount": gwb.amount,
        })
        fact += gwb.amount

    percent = 0
    if goal.target_amount and goal.target_amount > 0:
        percent = int(fact * 100 / goal.target_amount)

    # Goal history — transfers involving this goal
    history_txs = (
        db.query(TransactionFeed)
        .filter(
            TransactionFeed.account_id == user_id,
            or_(
                TransactionFeed.from_goal_id == goal_id,
                TransactionFeed.to_goal_id == goal_id,
            ),
        )
        .order_by(TransactionFeed.occurred_at.desc())
        .limit(50)
        .all()
    )

    # Build wallet title map for history
    wallet_ids = set()
    for tx in history_txs:
        if tx.from_wallet_id:
            wallet_ids.add(tx.from_wallet_id)
        if tx.to_wallet_id:
            wallet_ids.add(tx.to_wallet_id)

    wallet_map = {}
    if wallet_ids:
        for w in db.query(WalletBalance).filter(WalletBalance.wallet_id.in_(wallet_ids)).all():
            wallet_map[w.wallet_id] = w.title

    history = []
    for tx in history_txs:
        # Determine direction
        if tx.to_goal_id == goal_id and tx.from_goal_id == goal_id:
            direction = "transfer"
        elif tx.to_goal_id == goal_id:
            direction = "in"
        else:
            direction = "out"

        history.append({
            "occurred_at": tx.occurred_at,
            "direction": direction,
            "description": tx.description,
            "amount": tx.amount,
            "from_wallet_title": wallet_map.get(tx.from_wallet_id, "?"),
            "to_wallet_title": wallet_map.get(tx.to_wallet_id, "?"),
        })

    return templates.TemplateResponse("goal_detail.html", {
        "request": request,
        "goal": goal,
        "fact": fact,
        "percent": percent,
        "wallet_breakdown": wallet_breakdown,
        "history": history,
    })


@router.get("/goals/{goal_id}/edit", response_class=HTMLResponse)
def goal_edit_page(
    request: Request,
    goal_id: int,
    db: Session = Depends(get_db),
):
    """Форма редактирования цели"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    goal = db.query(GoalInfo).filter(
        GoalInfo.goal_id == goal_id,
        GoalInfo.account_id == user_id,
    ).first()

    if not goal or goal.is_system:
        return RedirectResponse("/goals", status_code=302)

    return templates.TemplateResponse("goal_form.html", {
        "request": request,
        "mode": "edit",
        "goal": goal,
    })


@router.post("/goals/{goal_id}/edit", response_class=HTMLResponse)
def goal_edit_submit(
    request: Request,
    goal_id: int,
    title: str = Form(...),
    target_amount: str = Form(""),
    db: Session = Depends(get_db),
):
    """Обновить цель"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    ta = target_amount.strip() or None

    try:
        UpdateGoalUseCase(db).execute(
            goal_id=goal_id,
            account_id=user_id,
            title=title,
            target_amount=ta,
            actor_user_id=user_id,
        )
        return RedirectResponse(f"/goals/{goal_id}", status_code=302)
    except (GoalValidationError, Exception) as e:
        db.rollback()
        goal = db.query(GoalInfo).filter(
            GoalInfo.goal_id == goal_id,
            GoalInfo.account_id == user_id,
        ).first()
        return templates.TemplateResponse("goal_form.html", {
            "request": request,
            "mode": "edit",
            "goal": goal,
            "error": str(e),
        })


# === Transactions ===

TX_PAGE_SIZE = 25


@router.get("/transactions", response_class=HTMLResponse)
def transactions_page(
    request: Request,
    operation_type: str = "",
    wallet_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    page: int = 1,
    new_type: str = "",
    db: Session = Depends(get_db),
):
    """Страница операций с фильтрами и пагинацией"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Кошельки для формы создания (только активные)
    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False,
    ).all()

    # Все кошельки для фильтра (включая архивные — чтобы видеть старые операции)
    all_wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
    ).all()
    wallet_map = {w.wallet_id: w for w in all_wallets}

    # Категории
    all_categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
    ).all()
    active_categories = [c for c in all_categories if not c.is_archived]
    category_map = {c.category_id: c for c in all_categories}

    # Базовый запрос
    q = db.query(TransactionFeed).filter(TransactionFeed.account_id == user_id)

    # Фильтр по типу
    if operation_type in ("INCOME", "EXPENSE", "TRANSFER"):
        q = q.filter(TransactionFeed.operation_type == operation_type)

    # Фильтр по кошельку
    if wallet_id:
        try:
            wid = int(wallet_id)
            q = q.filter(or_(
                TransactionFeed.wallet_id == wid,
                TransactionFeed.from_wallet_id == wid,
                TransactionFeed.to_wallet_id == wid,
            ))
        except ValueError:
            pass

    # Фильтр по категории
    if category_id:
        try:
            cid = int(category_id)
            q = q.filter(TransactionFeed.category_id == cid)
        except ValueError:
            pass

    # Фильтр по дате
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            q = q.filter(TransactionFeed.occurred_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            q = q.filter(TransactionFeed.occurred_at < dt_to)
        except ValueError:
            pass

    # Поиск по описанию
    if search:
        q = q.filter(TransactionFeed.description.ilike(f"%{search}%"))

    # Подсчёт для пагинации
    total_count = q.count()
    total_pages = max(1, (total_count + TX_PAGE_SIZE - 1) // TX_PAGE_SIZE)
    if page < 1:
        page = 1
    if page > total_pages:
        page = total_pages

    transactions = q.order_by(
        TransactionFeed.occurred_at.desc()
    ).offset((page - 1) * TX_PAGE_SIZE).limit(TX_PAGE_SIZE).all()

    # KPI по текущему фильтру — группировка по валюте
    _kpi: dict[str, dict] = {}
    for t in transactions:
        cur = t.currency
        if cur not in _kpi:
            _kpi[cur] = {"income": Decimal("0"), "expense": Decimal("0")}
        if t.operation_type == "INCOME":
            _kpi[cur]["income"] += t.amount
        elif t.operation_type == "EXPENSE":
            _kpi[cur]["expense"] += t.amount
    kpi_by_currency = {
        cur: {**vals, "difference": vals["income"] - vals["expense"]}
        for cur, vals in sorted(_kpi.items())
    }
    if not kpi_by_currency:
        kpi_by_currency = {"RUB": {"income": Decimal("0"), "expense": Decimal("0"), "difference": Decimal("0")}}

    # Строка query-параметров для пагинации (без page)
    filter_parts = []
    if operation_type:
        filter_parts.append(f"operation_type={operation_type}")
    if wallet_id:
        filter_parts.append(f"wallet_id={wallet_id}")
    if category_id:
        filter_parts.append(f"category_id={category_id}")
    if date_from:
        filter_parts.append(f"date_from={date_from}")
    if date_to:
        filter_parts.append(f"date_to={date_to}")
    if search:
        filter_parts.append(f"search={search}")
    filter_qs = "&".join(filter_parts)

    # Subscription category map for JS hook
    active_subs = db.query(SubscriptionModel).filter(
        SubscriptionModel.account_id == user_id,
        SubscriptionModel.is_archived == False,
    ).all()
    sub_category_map: dict = {}
    for s in active_subs:
        sub_category_map[str(s.expense_category_id)] = {
            "subscription_id": s.id,
            "subscription_name": s.name,
            "type": "expense",
            "members": [],
        }
        members = db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.subscription_id == s.id,
            SubscriptionMemberModel.is_archived == False,
        ).all()
        # Resolve contact names for members
        m_contact_ids = list({m.contact_id for m in members})
        m_contacts = {}
        if m_contact_ids:
            m_contacts = {c.id: c for c in db.query(ContactModel).filter(ContactModel.id.in_(m_contact_ids)).all()}
        sub_category_map[str(s.income_category_id)] = {
            "subscription_id": s.id,
            "subscription_name": s.name,
            "type": "income",
            "members": [{"id": m.id, "name": m_contacts[m.contact_id].name if m.contact_id in m_contacts else "?"} for m in members],
        }

    # Goals for transfer form (savings wallets require goal selection)
    goals = db.query(GoalInfo).filter(
        GoalInfo.account_id == user_id,
        GoalInfo.is_archived == False,
    ).all()

    # Wallet type map for JS (to know which wallets are SAVINGS)
    wallet_type_map = {w.wallet_id: w.wallet_type for w in wallets}

    # Balance maps for JS hints in the form
    wallet_balance_map = {
        w.wallet_id: {"balance": float(w.balance), "currency": w.currency}
        for w in wallets
    }
    goal_currency_map = {g.goal_id: g.currency for g in goals}
    _goal_bal_rows = (
        db.query(GoalWalletBalance.goal_id, func.sum(GoalWalletBalance.amount).label("total"))
        .filter(GoalWalletBalance.account_id == user_id)
        .group_by(GoalWalletBalance.goal_id)
        .all()
    )
    goal_balance_map = {row.goal_id: float(row.total) for row in _goal_bal_rows}

    return templates.TemplateResponse("transactions.html", {
        "request": request,
        "wallets": wallets,
        "all_wallets": all_wallets,
        "wallet_map": wallet_map,
        "categories": active_categories,
        "category_map": category_map,
        "transactions": transactions,
        "page": page,
        "total_pages": total_pages,
        "total_count": total_count,
        "filter_qs": filter_qs,
        "operation_type": operation_type,
        "wallet_id": wallet_id,
        "category_id": category_id,
        "date_from": date_from,
        "date_to": date_to,
        "search": search,
        "kpi_by_currency": kpi_by_currency,
        "sub_category_map": sub_category_map,
        "goals": goals,
        "wallet_type_map": wallet_type_map,
        "wallet_balance_map": wallet_balance_map,
        "goal_balance_map": goal_balance_map,
        "goal_currency_map": goal_currency_map,
        "new_type": new_type.upper() if new_type else "",
    })


@router.post("/transactions/create", response_class=HTMLResponse)
def create_transaction_form(
    request: Request,
    operation_type: str = Form(...),
    amount: str = Form(...),
    description: str = Form(""),
    wallet_id: int | None = Form(None),
    from_wallet_id: int | None = Form(None),
    to_wallet_id: int | None = Form(None),
    from_goal_id: int | None = Form(None),
    to_goal_id: int | None = Form(None),
    category_id: int | None = Form(None),
    occurred_at: str = Form(""),
    # Subscription coverage fields (optional)
    sub_subscription_id: int | None = Form(None),
    sub_payer_type: str | None = Form(None),
    sub_member_id: int | None = Form(None),
    sub_start_date: str | None = Form(None),
    sub_end_date: str | None = Form(None),
    redirect: str = Form("/transactions"),
    db: Session = Depends(get_db),
):
    """Обработка формы создания операции"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Парсинг даты
    tx_occurred_at = None
    if occurred_at:
        try:
            tx_occurred_at = datetime.strptime(occurred_at, "%Y-%m-%dT%H:%M")
        except ValueError:
            try:
                tx_occurred_at = datetime.strptime(occurred_at, "%Y-%m-%d")
            except ValueError:
                pass

    # Pre-validate subscription coverage (before creating transaction)
    has_coverage = bool(sub_subscription_id and sub_start_date and sub_end_date)
    if has_coverage:
        try:
            cov_start = date.fromisoformat(sub_start_date)
            cov_end = date.fromisoformat(sub_end_date)
            validate_coverage_before_transaction(
                db,
                account_id=user_id,
                subscription_id=sub_subscription_id,
                payer_type=sub_payer_type or "SELF",
                member_id=sub_member_id,
                start_date=cov_start,
                end_date=cov_end,
            )
        except SubscriptionValidationError as e:
            return RedirectResponse(f"/transactions?error={e}", status_code=302)

    try:
        use_case = CreateTransactionUseCase(db)
        amount_decimal = Decimal(amount)
        transaction_id = None

        if operation_type == "INCOME":
            if not wallet_id:
                raise ValueError("wallet_id required for INCOME")
            wallet = db.query(WalletBalance).filter(
                WalletBalance.wallet_id == wallet_id
            ).first()
            if not wallet:
                raise ValueError("Wallet not found")

            transaction_id = use_case.execute_income(
                account_id=user_id,
                wallet_id=wallet_id,
                amount=amount_decimal,
                currency=wallet.currency,
                category_id=category_id,
                description=description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
            )
        elif operation_type == "EXPENSE":
            if not wallet_id:
                raise ValueError("wallet_id required for EXPENSE")
            wallet = db.query(WalletBalance).filter(
                WalletBalance.wallet_id == wallet_id
            ).first()
            if not wallet:
                raise ValueError("Wallet not found")

            transaction_id = use_case.execute_expense(
                account_id=user_id,
                wallet_id=wallet_id,
                amount=amount_decimal,
                currency=wallet.currency,
                category_id=category_id,
                description=description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
            )
        elif operation_type == "TRANSFER":
            if not from_wallet_id or not to_wallet_id:
                raise ValueError("from_wallet_id and to_wallet_id required for TRANSFER")
            from_wallet = db.query(WalletBalance).filter(
                WalletBalance.wallet_id == from_wallet_id
            ).first()
            if not from_wallet:
                raise ValueError("From wallet not found")

            transaction_id = use_case.execute_transfer(
                account_id=user_id,
                from_wallet_id=from_wallet_id,
                to_wallet_id=to_wallet_id,
                amount=amount_decimal,
                currency=from_wallet.currency,
                description=description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
                from_goal_id=from_goal_id or None,
                to_goal_id=to_goal_id or None,
            )
        else:
            raise ValueError("Invalid operation_type")

        # Create subscription coverage if fields present
        if has_coverage and transaction_id:
            cov_start = date.fromisoformat(sub_start_date)
            cov_end = date.fromisoformat(sub_end_date)
            CreateSubscriptionCoverageUseCase(db).execute(
                account_id=user_id,
                subscription_id=sub_subscription_id,
                payer_type=sub_payer_type or "SELF",
                member_id=sub_member_id,
                transaction_id=transaction_id,
                start_date=cov_start,
                end_date=cov_end,
            )

        request.session["flash"] = {"message": "🎉 +5 XP"}
        return RedirectResponse(redirect, status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/transactions?error={e}", status_code=302)


@router.get("/transactions/{transaction_id}/edit", response_class=HTMLResponse)
def edit_transaction_page(
    request: Request,
    transaction_id: int,
    db: Session = Depends(get_db),
):
    """Форма редактирования операции"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    tx = db.query(TransactionFeed).filter(
        TransactionFeed.transaction_id == transaction_id,
        TransactionFeed.account_id == user_id,
    ).first()
    if not tx:
        return RedirectResponse("/transactions?error=Операция не найдена", status_code=302)

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False,
    ).order_by(WalletBalance.title).all()

    categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
    ).order_by(CategoryInfo.title).all()

    return templates.TemplateResponse("transactions_edit.html", {
        "request": request,
        "tx": tx,
        "wallets": wallets,
        "categories": categories,
    })


@router.post("/transactions/{transaction_id}/edit", response_class=HTMLResponse)
def update_transaction_form(
    request: Request,
    transaction_id: int,
    amount: str = Form(...),
    description: str = Form(""),
    wallet_id: int | None = Form(None),
    from_wallet_id: int | None = Form(None),
    to_wallet_id: int | None = Form(None),
    category_id: int | None = Form(None),
    occurred_at: str = Form(""),
    db: Session = Depends(get_db),
):
    """Обработка формы редактирования операции"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    tx_occurred_at = None
    if occurred_at:
        try:
            tx_occurred_at = datetime.strptime(occurred_at, "%Y-%m-%dT%H:%M")
        except ValueError:
            try:
                tx_occurred_at = datetime.strptime(occurred_at, "%Y-%m-%d")
            except ValueError:
                pass

    try:
        changes = {
            "amount": Decimal(amount),
            "description": description,
            "category_id": category_id,
        }
        if wallet_id is not None:
            changes["wallet_id"] = wallet_id
        if from_wallet_id is not None:
            changes["from_wallet_id"] = from_wallet_id
        if to_wallet_id is not None:
            changes["to_wallet_id"] = to_wallet_id
        if tx_occurred_at is not None:
            changes["occurred_at"] = tx_occurred_at

        UpdateTransactionUseCase(db).execute(
            transaction_id=transaction_id,
            account_id=user_id,
            actor_user_id=user_id,
            **changes,
        )
        return RedirectResponse("/transactions", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(
            f"/transactions/{transaction_id}/edit?error={e}",
            status_code=302,
        )


# === Categories ===

@router.get("/categories", response_class=HTMLResponse)
def categories_page(
    request: Request,
    kind: str = "expense",  # expense or income
    status: str = "active",  # active, archived, all
    q: str = "",  # search query
    db: Session = Depends(get_db)
):
    """Страница управления категориями (статьями)"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Ensure system categories exist
    ensure_use_case = EnsureSystemCategoriesUseCase(db)
    ensure_use_case.execute(account_id=user_id, actor_user_id=user_id)

    # Get filtered categories
    service = ListCategoriesService(db)
    result = service.execute(
        account_id=user_id,
        kind=kind,
        status=status,
        search_query=q if q else None
    )

    return templates.TemplateResponse("categories.html", {
        "request": request,
        "categories": result["categories"],
        "counts": result["counts"],
        "kind": kind,
        "status": status,
        "q": q
    })


@router.get("/categories/new", response_class=HTMLResponse)
def category_new_page(
    request: Request,
    kind: str = "expense",
    db: Session = Depends(get_db)
):
    """Страница создания категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    category_type = "EXPENSE" if kind == "expense" else "INCOME"
    parent_candidates = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.category_type == category_type,
        CategoryInfo.is_archived == False,
        CategoryInfo.parent_id == None,
    ).order_by(CategoryInfo.title).all()

    return templates.TemplateResponse("category_form.html", {
        "request": request,
        "mode": "new",
        "kind": kind,
        "parent_candidates": parent_candidates,
    })


@router.post("/categories/new", response_class=HTMLResponse)
def create_category_handler(
    request: Request,
    title: str = Form(...),
    kind: str = Form(...),
    parent_id: int | None = Form(None),
    db: Session = Depends(get_db)
):
    """Обработка формы создания категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        # Map kind to category_type
        if kind == "expense":
            category_type = "EXPENSE"
        elif kind == "income":
            category_type = "INCOME"
        else:
            raise ValueError("Неверный тип категории")

        # parent_id=0 means "no parent" from the form select
        if parent_id is not None and parent_id <= 0:
            parent_id = None

        use_case = CreateCategoryUseCase(db)
        use_case.execute(
            account_id=user_id,
            title=title,
            category_type=category_type,
            parent_id=parent_id,
            is_system=False,
            actor_user_id=user_id
        )
        return RedirectResponse(f"/categories?kind={kind}", status_code=302)
    except Exception as e:
        db.rollback()
        category_type = "EXPENSE" if kind == "expense" else "INCOME"
        parent_candidates = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.category_type == category_type,
            CategoryInfo.is_archived == False,
            CategoryInfo.parent_id == None,
        ).order_by(CategoryInfo.title).all()
        return templates.TemplateResponse("category_form.html", {
            "request": request,
            "mode": "new",
            "kind": kind,
            "form_title": title,
            "form_parent_id": parent_id,
            "parent_candidates": parent_candidates,
            "error": str(e)
        })


@router.get("/categories/{category_id}/edit", response_class=HTMLResponse)
def category_edit_page(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Страница редактирования категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id
    ).first()

    if not category:
        return RedirectResponse("/categories?error=Категория+не+найдена", status_code=302)

    if category.is_system:
        return RedirectResponse("/categories?error=Нельзя+редактировать+системную+категорию", status_code=302)

    kind = "expense" if category.category_type == "EXPENSE" else "income"

    parent_candidates = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.category_type == category.category_type,
        CategoryInfo.is_archived == False,
        CategoryInfo.parent_id == None,
        CategoryInfo.category_id != category_id,
    ).order_by(CategoryInfo.title).all()

    return templates.TemplateResponse("category_form.html", {
        "request": request,
        "mode": "edit",
        "category": category,
        "kind": kind,
        "parent_candidates": parent_candidates,
    })


@router.post("/categories/{category_id}/edit", response_class=HTMLResponse)
def update_category_handler(
    request: Request,
    category_id: int,
    title: str = Form(...),
    parent_id: int | None = Form(None),
    is_archived: bool = Form(False),
    db: Session = Depends(get_db)
):
    """Обработка формы редактирования категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        # Get category to determine kind and current state
        category = db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == user_id
        ).first()

        if not category:
            raise CategoryValidationError("Категория не найдена")

        kind = "expense" if category.category_type == "EXPENSE" else "income"

        # parent_id=0 means "no parent" from the form select
        if parent_id is not None and parent_id <= 0:
            parent_id = None

        # Update title and parent
        use_case = UpdateCategoryUseCase(db)
        use_case.execute(
            category_id=category_id,
            account_id=user_id,
            title=title,
            parent_id=parent_id,
            actor_user_id=user_id
        )

        # Handle archive/unarchive if state changed
        if is_archived and not category.is_archived:
            # Archive category
            archive_use_case = ArchiveCategoryUseCase(db)
            archive_use_case.execute(
                category_id=category_id,
                account_id=user_id,
                actor_user_id=user_id
            )
        elif not is_archived and category.is_archived:
            # Unarchive category
            unarchive_use_case = UnarchiveCategoryUseCase(db)
            unarchive_use_case.execute(
                category_id=category_id,
                account_id=user_id,
                actor_user_id=user_id
            )

        return RedirectResponse(f"/categories?kind={kind}", status_code=302)
    except Exception as e:
        db.rollback()
        category = db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == user_id
        ).first()
        if not category:
            return RedirectResponse("/categories?error=" + str(e), status_code=302)
        kind = "expense" if category.category_type == "EXPENSE" else "income"
        parent_candidates = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.category_type == category.category_type,
            CategoryInfo.is_archived == False,
            CategoryInfo.parent_id == None,
            CategoryInfo.category_id != category_id,
        ).order_by(CategoryInfo.title).all()
        return templates.TemplateResponse("category_form.html", {
            "request": request,
            "mode": "edit",
            "category": category,
            "kind": kind,
            "parent_candidates": parent_candidates,
            "error": str(e)
        })


@router.get("/categories/{category_id}/confirm-archive", response_class=HTMLResponse)
def category_confirm_archive_page(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Страница подтверждения архивирования категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id
    ).first()

    if not category:
        return RedirectResponse("/categories?error=Категория+не+найдена", status_code=302)

    if category.is_system:
        return RedirectResponse("/categories?error=Нельзя+архивировать+системную+категорию", status_code=302)

    kind = "expense" if category.category_type == "EXPENSE" else "income"

    return templates.TemplateResponse("category_confirm.html", {
        "request": request,
        "category": category,
        "action": "archive",
        "kind": kind
    })


@router.post("/categories/{category_id}/archive", response_class=HTMLResponse)
def archive_category_handler(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Обработка архивирования категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        # Get category to determine kind for redirect
        category = db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == user_id
        ).first()

        if category:
            kind = "expense" if category.category_type == "EXPENSE" else "income"
        else:
            kind = "expense"

        use_case = ArchiveCategoryUseCase(db)
        use_case.execute(
            category_id=category_id,
            account_id=user_id,
            actor_user_id=user_id
        )
        return RedirectResponse(f"/categories?kind={kind}&status=active", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/categories?error={str(e)}", status_code=302)


@router.get("/categories/{category_id}/confirm-unarchive", response_class=HTMLResponse)
def category_confirm_unarchive_page(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Страница подтверждения восстановления категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id
    ).first()

    if not category:
        return RedirectResponse("/categories?error=Категория+не+найдена", status_code=302)

    if category.is_system:
        return RedirectResponse("/categories?error=Системная+категория+не+может+быть+в+архиве", status_code=302)

    kind = "expense" if category.category_type == "EXPENSE" else "income"

    return templates.TemplateResponse("category_confirm.html", {
        "request": request,
        "category": category,
        "action": "unarchive",
        "kind": kind
    })


@router.post("/categories/{category_id}/unarchive", response_class=HTMLResponse)
def unarchive_category_handler(
    request: Request,
    category_id: int,
    db: Session = Depends(get_db)
):
    """Обработка восстановления категории из архива"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        # Get category to determine kind for redirect
        category = db.query(CategoryInfo).filter(
            CategoryInfo.category_id == category_id,
            CategoryInfo.account_id == user_id
        ).first()

        if category:
            kind = "expense" if category.category_type == "EXPENSE" else "income"
        else:
            kind = "expense"

        use_case = UnarchiveCategoryUseCase(db)
        use_case.execute(
            category_id=category_id,
            account_id=user_id,
            actor_user_id=user_id
        )
        return RedirectResponse(f"/categories?kind={kind}&status=active", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/categories?error={str(e)}", status_code=302)


# === Work Categories ===

@router.get("/work-categories", response_class=HTMLResponse)
def work_categories_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    categories = db.query(WorkCategory).filter(WorkCategory.account_id == user_id).order_by(WorkCategory.title).all()
    return templates.TemplateResponse("work_categories.html", {"request": request, "categories": categories})


@router.post("/work-categories/create", response_class=HTMLResponse)
def create_work_category_form(request: Request, title: str = Form(...), emoji: str = Form(""), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        uc = CreateWorkCategoryUseCase(db)
        uc.execute(account_id=user_id, title=title, emoji=emoji.strip() or None, actor_user_id=user_id)
        return RedirectResponse("/work-categories", status_code=302)
    except Exception as e:
        db.rollback()
        categories = db.query(WorkCategory).filter(WorkCategory.account_id == user_id).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("work_categories.html", {"request": request, "categories": categories, "error": str(e)})


@router.post("/work-categories/{category_id}/update", response_class=HTMLResponse)
def update_work_category_form(request: Request, category_id: int, title: str = Form(...), emoji: str = Form(""), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        uc = UpdateWorkCategoryUseCase(db)
        uc.execute(category_id=category_id, account_id=user_id, title=title, emoji=emoji.strip() or None, actor_user_id=user_id)
        return RedirectResponse("/work-categories", status_code=302)
    except Exception as e:
        db.rollback()
        categories = db.query(WorkCategory).filter(WorkCategory.account_id == user_id).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("work_categories.html", {"request": request, "categories": categories, "error": str(e)})


@router.post("/work-categories/{category_id}/archive", response_class=HTMLResponse)
def archive_work_category_form(request: Request, category_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        uc = ArchiveWorkCategoryUseCase(db)
        uc.execute(category_id=category_id, account_id=user_id, actor_user_id=user_id)
        return RedirectResponse("/work-categories", status_code=302)
    except Exception as e:
        db.rollback()
        categories = db.query(WorkCategory).filter(WorkCategory.account_id == user_id).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("work_categories.html", {"request": request, "categories": categories, "error": str(e)})


# === Task Categories (new UX) ===

@router.get("/task-categories", response_class=HTMLResponse)
def task_categories_list(request: Request, view: str = "active", q: str = "", db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    query = db.query(WorkCategory).filter(WorkCategory.account_id == user_id)
    if view == "archived":
        query = query.filter(WorkCategory.is_archived == True)  # noqa: E712
    else:
        query = query.filter(WorkCategory.is_archived == False)  # noqa: E712
    if q.strip():
        query = query.filter(WorkCategory.title.ilike(f"%{q.strip()}%"))
    categories = query.order_by(WorkCategory.title).all()

    return templates.TemplateResponse("task_categories_list.html", {
        "request": request, "categories": categories,
        "view": view, "q": q,
    })


@router.get("/task-categories/new", response_class=HTMLResponse)
def task_category_new_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("task_category_form.html", {
        "request": request, "mode": "new",
    })


@router.post("/task-categories/new", response_class=HTMLResponse)
def task_category_create(request: Request, title: str = Form(...), emoji: str = Form(""), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateWorkCategoryUseCase(db).execute(
            account_id=user_id, title=title, emoji=emoji.strip() or None, actor_user_id=user_id,
        )
        return RedirectResponse("/task-categories", status_code=302)
    except WorkCategoryValidationError as e:
        return templates.TemplateResponse("task_category_form.html", {
            "request": request, "mode": "new",
            "error": str(e), "form_title": title, "form_emoji": emoji,
        })


@router.get("/task-categories/{category_id}/edit", response_class=HTMLResponse)
def task_category_edit_page(request: Request, category_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    cat = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id,
        WorkCategory.account_id == user_id,
    ).first()
    if not cat:
        return RedirectResponse("/task-categories", status_code=302)
    return templates.TemplateResponse("task_category_form.html", {
        "request": request, "mode": "edit", "cat": cat,
    })


@router.post("/task-categories/{category_id}/edit", response_class=HTMLResponse)
def task_category_update(
    request: Request, category_id: int,
    title: str = Form(...), emoji: str = Form(""),
    is_archived: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    cat = db.query(WorkCategory).filter(
        WorkCategory.category_id == category_id,
        WorkCategory.account_id == user_id,
    ).first()
    if not cat:
        return RedirectResponse("/task-categories", status_code=302)

    want_archived = is_archived == "on"
    try:
        # Unarchive first (if needed) so update doesn't hit stale state
        if cat.is_archived and not want_archived:
            UnarchiveWorkCategoryUseCase(db).execute(category_id, user_id, actor_user_id=user_id)

        # Update title/emoji
        UpdateWorkCategoryUseCase(db).execute(
            category_id=category_id, account_id=user_id,
            title=title, emoji=emoji.strip() or None, actor_user_id=user_id,
        )

        # Archive last (if needed)
        if not cat.is_archived and want_archived:
            ArchiveWorkCategoryUseCase(db).execute(category_id, user_id, actor_user_id=user_id)

        redirect_view = "archived" if want_archived else "active"
        return RedirectResponse(f"/task-categories?view={redirect_view}", status_code=302)
    except WorkCategoryValidationError as e:
        # Reload cat from DB to show current state
        db.rollback()
        cat = db.query(WorkCategory).filter(
            WorkCategory.category_id == category_id,
            WorkCategory.account_id == user_id,
        ).first()
        return templates.TemplateResponse("task_category_form.html", {
            "request": request, "mode": "edit", "cat": cat, "error": str(e),
        })


# === Tasks ===


def _build_discipline_metrics(db: Session, user_id: int, today: date) -> dict:
    """Discipline score (0..100) and reschedule stats from event_log. No new tables."""
    from collections import Counter

    d7 = today - timedelta(days=6)
    d30 = today - timedelta(days=29)

    # --- Completed on time / late (7 days) ---
    completed_on_time_7 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        TaskModel.due_date.isnot(None),
        func.date(TaskModel.completed_at) >= d7,
        func.date(TaskModel.completed_at) <= today,
        func.date(TaskModel.completed_at) <= TaskModel.due_date,
    ).scalar() or 0

    completed_late_7 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        TaskModel.due_date.isnot(None),
        func.date(TaskModel.completed_at) >= d7,
        func.date(TaskModel.completed_at) <= today,
        func.date(TaskModel.completed_at) > TaskModel.due_date,
    ).scalar() or 0

    # --- Overdue now (active tasks past due) ---
    overdue_now = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        TaskModel.status == "ACTIVE",
        TaskModel.due_date.isnot(None),
        TaskModel.due_date < today,
    ).scalar() or 0

    # --- Reschedules from task_due_change_log ---
    reschedules_7 = db.query(func.count()).filter(
        TaskDueChangeLog.user_id == user_id,
        func.date(TaskDueChangeLog.changed_at) >= d7,
        func.date(TaskDueChangeLog.changed_at) <= today,
    ).scalar() or 0

    reschedules_30 = db.query(func.count()).filter(
        TaskDueChangeLog.user_id == user_id,
        func.date(TaskDueChangeLog.changed_at) >= d30,
        func.date(TaskDueChangeLog.changed_at) <= today,
    ).scalar() or 0

    # Top-5 tasks by reschedule count (30 days)
    top_tasks_q = db.query(
        TaskDueChangeLog.task_id,
        func.count().label("cnt"),
    ).filter(
        TaskDueChangeLog.user_id == user_id,
        func.date(TaskDueChangeLog.changed_at) >= d30,
        func.date(TaskDueChangeLog.changed_at) <= today,
    ).group_by(TaskDueChangeLog.task_id).order_by(
        func.count().desc()
    ).limit(5).all()

    reschedule_top = []
    if top_tasks_q:
        top_task_ids = [r.task_id for r in top_tasks_q]
        title_rows = db.query(TaskModel.task_id, TaskModel.title).filter(
            TaskModel.task_id.in_(top_task_ids),
        ).all()
        title_map = {t.task_id: t.title for t in title_rows}
        for r in top_tasks_q:
            reschedule_top.append({
                "task_id": r.task_id,
                "title": title_map.get(r.task_id, f"Задача #{r.task_id}"),
                "count": r.cnt,
            })

    # Top-5 reasons (30 days)
    reason_stats = db.query(
        TaskRescheduleReason.name,
        func.count().label("cnt"),
    ).join(
        TaskDueChangeLog, TaskDueChangeLog.reason_id == TaskRescheduleReason.id,
    ).filter(
        TaskDueChangeLog.user_id == user_id,
        func.date(TaskDueChangeLog.changed_at) >= d30,
        func.date(TaskDueChangeLog.changed_at) <= today,
    ).group_by(TaskRescheduleReason.name).order_by(
        func.count().desc()
    ).limit(5).all()
    reason_top_30 = [{"name": r.name, "count": r.cnt} for r in reason_stats]

    # --- Discipline score (0..100) ---
    # Penalties (easily tunable)
    PENALTY_PER_OVERDUE = 10
    PENALTY_MAX_OVERDUE = 40
    PENALTY_PER_LATE = 5
    PENALTY_MAX_LATE = 30
    PENALTY_PER_RESCHEDULE = 3
    PENALTY_MAX_RESCHEDULE = 30

    penalty_overdue = min(PENALTY_MAX_OVERDUE, overdue_now * PENALTY_PER_OVERDUE)
    penalty_late = min(PENALTY_MAX_LATE, completed_late_7 * PENALTY_PER_LATE)
    penalty_reschedules = min(PENALTY_MAX_RESCHEDULE, reschedules_7 * PENALTY_PER_RESCHEDULE)
    score = max(0, 100 - penalty_overdue - penalty_late - penalty_reschedules)

    return {
        "score": score,
        "completed_on_time_7": completed_on_time_7,
        "completed_late_7": completed_late_7,
        "overdue_now": overdue_now,
        "reschedules_7": reschedules_7,
        "reschedules_30": reschedules_30,
        "reschedule_top_30": reschedule_top,
        "reason_top_30": reason_top_30,
    }


def _build_task_analytics(db: Session, user_id: int, today: date, work_categories) -> dict:
    """Build analytics dict for 7d, 30d summaries and by-category breakdown (SQL aggregates)."""
    from sqlalchemy import case, literal

    d7 = today - timedelta(days=6)
    d30 = today - timedelta(days=29)

    cat_map = {c.category_id: c for c in work_categories}

    # --- 7-day summary ---
    created_7 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        func.date(TaskModel.created_at) >= d7,
        func.date(TaskModel.created_at) <= today,
    ).scalar() or 0
    completed_7 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        func.date(TaskModel.completed_at) >= d7,
        func.date(TaskModel.completed_at) <= today,
    ).scalar() or 0

    # --- 30-day summary ---
    created_30 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        func.date(TaskModel.created_at) >= d30,
        func.date(TaskModel.created_at) <= today,
    ).scalar() or 0
    completed_30 = db.query(func.count()).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        func.date(TaskModel.completed_at) >= d30,
        func.date(TaskModel.completed_at) <= today,
    ).scalar() or 0

    # --- By category (30 days) ---
    cat_created = db.query(
        TaskModel.category_id,
        func.count().label("cnt"),
    ).filter(
        TaskModel.account_id == user_id,
        func.date(TaskModel.created_at) >= d30,
        func.date(TaskModel.created_at) <= today,
    ).group_by(TaskModel.category_id).all()

    cat_completed = db.query(
        TaskModel.category_id,
        func.count().label("cnt"),
    ).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        func.date(TaskModel.completed_at) >= d30,
        func.date(TaskModel.completed_at) <= today,
    ).group_by(TaskModel.category_id).all()

    created_map = {row.category_id: row.cnt for row in cat_created}
    completed_map = {row.category_id: row.cnt for row in cat_completed}
    all_cat_ids = set(created_map.keys()) | set(completed_map.keys())

    by_category = []
    for cid in all_cat_ids:
        c = created_map.get(cid, 0)
        d = completed_map.get(cid, 0)
        cat = cat_map.get(cid)
        name = (cat.emoji + " " if cat and cat.emoji else "") + cat.title if cat else "Без категории"
        by_category.append({
            "category_name": name,
            "created": c,
            "completed": d,
            "rate": round(d / max(c, 1) * 100),
        })
    by_category.sort(key=lambda x: x["completed"], reverse=True)
    by_category = by_category[:8]

    # --- Daily completed (7 days, for mini-chart) ---
    _weekday_names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
    daily_rows = db.query(
        func.date(TaskModel.completed_at).label("d"),
        func.count().label("cnt"),
    ).filter(
        TaskModel.account_id == user_id,
        TaskModel.completed_at.isnot(None),
        func.date(TaskModel.completed_at) >= d7,
        func.date(TaskModel.completed_at) <= today,
    ).group_by(func.date(TaskModel.completed_at)).all()
    daily_map = {row.d: row.cnt for row in daily_rows}
    # Handle string keys from SQLite (func.date returns str in SQLite)
    daily_map_norm: dict[date, int] = {}
    for k, v in daily_map.items():
        if isinstance(k, str):
            daily_map_norm[date.fromisoformat(k)] = v
        else:
            daily_map_norm[k] = v

    productivity_7 = []
    for i in range(7):
        d = d7 + timedelta(days=i)
        productivity_7.append({
            "date": d.isoformat(),
            "weekday": _weekday_names[d.weekday()],
            "count": daily_map_norm.get(d, 0),
            "is_today": d == today,
        })

    return {
        "days7": {
            "created": created_7,
            "completed": completed_7,
            "completion_rate": round(completed_7 / max(created_7, 1) * 100),
        },
        "days30": {
            "created": created_30,
            "completed": completed_30,
            "completion_rate": round(completed_30 / max(created_30, 1) * 100),
        },
        "by_category_30": by_category,
        "productivity_7": productivity_7,
    }


@router.get("/tasks", response_class=HTMLResponse)
def tasks_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    gen = OccurrenceGenerator(db)
    gen.generate_task_occurrences(user_id)

    tasks = db.query(TaskModel).filter(
        TaskModel.account_id == user_id, TaskModel.status != "ARCHIVED",
    ).order_by(TaskModel.due_date.asc().nullslast(), TaskModel.created_at.desc()).all()

    task_templates = db.query(TaskTemplateModel).filter(
        TaskTemplateModel.account_id == user_id, TaskTemplateModel.is_archived == False,
    ).all()

    today = date.today()
    task_occurrences = db.query(TaskOccurrence).filter(
        TaskOccurrence.account_id == user_id,
        TaskOccurrence.scheduled_date >= today - timedelta(days=7),
        TaskOccurrence.scheduled_date <= today + timedelta(days=30),
    ).order_by(TaskOccurrence.scheduled_date.asc()).all()

    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()

    # Reminder presets for task form
    from app.infrastructure.db.models import UserReminderTimePreset
    from app.application.reminder_presets import ReminderPresetsService
    reminder_presets = db.query(UserReminderTimePreset).filter(
        UserReminderTimePreset.account_id == user_id,
    ).order_by(UserReminderTimePreset.sort_order).all()
    if not reminder_presets:
        ReminderPresetsService(db).seed_defaults(user_id)
        reminder_presets = db.query(UserReminderTimePreset).filter(
            UserReminderTimePreset.account_id == user_id,
        ).order_by(UserReminderTimePreset.sort_order).all()

    # Task-expense link: load user setting + expense categories + wallets
    user = db.query(User).filter(User.id == user_id).first()
    enable_task_expense_link = user.enable_task_expense_link if user else False
    expense_categories = []
    task_wallets = []
    if enable_task_expense_link:
        expense_categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.category_type == "EXPENSE",
            CategoryInfo.is_archived == False,
        ).order_by(CategoryInfo.title).all()
        task_wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id,
            WalletBalance.is_archived == False,
        ).all()

    # Task presets (quick templates)
    enable_task_templates = user.enable_task_templates if user else False
    task_presets = []
    if enable_task_templates:
        task_presets = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.is_active == True,
        ).order_by(TaskPresetModel.sort_order, TaskPresetModel.id).all()

    # Task reschedule reasons
    enable_reschedule_reasons = user.enable_task_reschedule_reasons if user else False
    reschedule_reasons = []
    if enable_reschedule_reasons:
        reschedule_reasons = db.query(TaskRescheduleReason).filter(
            TaskRescheduleReason.user_id == user_id,
            TaskRescheduleReason.is_active == True,
        ).order_by(TaskRescheduleReason.sort_order, TaskRescheduleReason.id).all()

    # --- Prepare display blocks ---
    active_tasks = [t for t in tasks if t.status == "ACTIVE"]
    done_tasks = [t for t in tasks if t.status == "DONE"]

    # Block "Сегодня": overdue (due_date < today) + today's tasks
    overdue = [t for t in active_tasks if t.due_date and t.due_date < today]
    today_due = [t for t in active_tasks if t.due_date and t.due_date == today]
    today_tasks = sorted(overdue, key=lambda t: t.due_date) + today_due

    # Block "Ближайшие 14 дней": due_date in (today, today+14]
    deadline_14 = today + timedelta(days=14)
    upcoming_14 = sorted(
        [t for t in active_tasks if t.due_date and today < t.due_date <= deadline_14],
        key=lambda t: t.due_date,
    )

    # Block "Без срока": active tasks without due_date
    no_date_tasks = [t for t in active_tasks if not t.due_date]

    # Block "Позже": active tasks with due_date > today+14
    later_tasks = sorted(
        [t for t in active_tasks if t.due_date and t.due_date > deadline_14],
        key=lambda t: t.due_date,
    )

    # Block "Повторяющиеся": for each template, only nearest ACTIVE occurrence
    recurring_items = []
    for tmpl in task_templates:
        tmpl_occs = [
            occ for occ in task_occurrences
            if occ.template_id == tmpl.template_id and occ.status == "ACTIVE"
        ]
        nearest = min(tmpl_occs, key=lambda o: o.scheduled_date) if tmpl_occs else None
        recurring_items.append({
            "template": tmpl,
            "nearest_occ": nearest,
        })
    # Sort: templates with nearest occurrence first, then by date
    recurring_items.sort(
        key=lambda x: x["nearest_occ"].scheduled_date if x["nearest_occ"] else date.max,
    )

    # --- Progress metrics ---
    planned_today = len(today_due) + sum(
        1 for o in task_occurrences if o.scheduled_date == today and o.status == "ACTIVE"
    )
    completed_today = sum(
        1 for t in tasks if t.completed_at and t.completed_at.date() == today
    ) + sum(
        1 for o in task_occurrences if o.completed_at and o.completed_at.date() == today
    )
    overdue_count = len(overdue)

    # --- Analytics (7d / 30d / by category) ---
    analytics = _build_task_analytics(db, user_id, today, work_categories)
    discipline = _build_discipline_metrics(db, user_id, today)

    return templates.TemplateResponse("tasks.html", {
        "request": request, "tasks": tasks, "task_templates": task_templates,
        "task_occurrences": task_occurrences, "work_categories": work_categories,
        "today": today, "reminder_presets": reminder_presets,
        "enable_task_expense_link": enable_task_expense_link,
        "expense_categories": expense_categories,
        "task_wallets": task_wallets,
        "enable_task_templates": enable_task_templates,
        "task_presets": task_presets,
        "today_tasks": today_tasks,
        "upcoming_14": upcoming_14,
        "no_date_tasks": no_date_tasks,
        "later_tasks": later_tasks,
        "done_tasks": done_tasks,
        "recurring_items": recurring_items,
        "planned_today": planned_today,
        "completed_today": completed_today,
        "overdue_count": overdue_count,
        "analytics": analytics,
        "discipline": discipline,
        "enable_reschedule_reasons": enable_reschedule_reasons,
        "reschedule_reasons": reschedule_reasons,
    })


@router.post("/tasks/create")
def create_task_form(
    request: Request,
    mode: str = Form("once"),
    title: str = Form(...),
    redirect: str = Form("/tasks"),
    due_kind: str = Form("NONE"),
    due_date: str = Form(""),
    due_time: str = Form(""),
    due_start_time: str = Form(""),
    due_end_time: str = Form(""),
    reminders: str = Form(""),
    freq: str = Form(""),
    interval: int = Form(1),
    start_date: str = Form(""),
    by_monthday: int | None = Form(None),
    weekday_MO: str = Form(""), weekday_TU: str = Form(""), weekday_WE: str = Form(""),
    weekday_TH: str = Form(""), weekday_FR: str = Form(""), weekday_SA: str = Form(""),
    weekday_SU: str = Form(""),
    category_id: int | None = Form(None),
    note: str = Form(""),
    active_until: str = Form(""),
    requires_expense: str = Form(""),
    suggested_expense_category_id: int | None = Form(None),
    suggested_amount: str = Form(""),
    multi_dates: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    def _render_error(msg: str):
        db.rollback()
        gen = OccurrenceGenerator(db)
        gen.generate_task_occurrences(user_id)
        tasks = db.query(TaskModel).filter(TaskModel.account_id == user_id, TaskModel.status != "ARCHIVED").order_by(TaskModel.due_date.asc().nullslast(), TaskModel.created_at.desc()).all()
        task_tmpls = db.query(TaskTemplateModel).filter(TaskTemplateModel.account_id == user_id, TaskTemplateModel.is_archived == False).all()
        today = date.today()
        task_occs = db.query(TaskOccurrence).filter(TaskOccurrence.account_id == user_id, TaskOccurrence.scheduled_date >= today - timedelta(days=7), TaskOccurrence.scheduled_date <= today + timedelta(days=30)).order_by(TaskOccurrence.scheduled_date.asc()).all()
        work_cats = db.query(WorkCategory).filter(WorkCategory.account_id == user_id, WorkCategory.is_archived == False).order_by(WorkCategory.title).all()
        from app.infrastructure.db.models import UserReminderTimePreset
        rem_presets = db.query(UserReminderTimePreset).filter(UserReminderTimePreset.account_id == user_id).order_by(UserReminderTimePreset.sort_order).all()
        _user = db.query(User).filter(User.id == user_id).first()
        _enable_tt = _user.enable_task_templates if _user else False
        _presets = db.query(TaskPresetModel).filter(TaskPresetModel.account_id == user_id, TaskPresetModel.is_active == True).order_by(TaskPresetModel.sort_order, TaskPresetModel.id).all() if _enable_tt else []
        # Prepare display blocks for template
        _active = [t for t in tasks if t.status == "ACTIVE"]
        _done = [t for t in tasks if t.status == "DONE"]
        _overdue = [t for t in _active if t.due_date and t.due_date < today]
        _today_due = [t for t in _active if t.due_date and t.due_date == today]
        _today_tasks = sorted(_overdue, key=lambda t: t.due_date) + _today_due
        _dl14 = today + timedelta(days=14)
        _upcoming = sorted([t for t in _active if t.due_date and today < t.due_date <= _dl14], key=lambda t: t.due_date)
        _no_date = [t for t in _active if not t.due_date]
        _later = sorted([t for t in _active if t.due_date and t.due_date > _dl14], key=lambda t: t.due_date)
        _rec_items = []
        for _tmpl in task_tmpls:
            _tocc = [o for o in task_occs if o.template_id == _tmpl.template_id and o.status == "ACTIVE"]
            _near = min(_tocc, key=lambda o: o.scheduled_date) if _tocc else None
            _rec_items.append({"template": _tmpl, "nearest_occ": _near})
        _rec_items.sort(key=lambda x: x["nearest_occ"].scheduled_date if x["nearest_occ"] else date.max)
        _planned = len(_today_due) + sum(1 for o in task_occs if o.scheduled_date == today and o.status == "ACTIVE")
        _completed = sum(1 for t in tasks if t.completed_at and t.completed_at.date() == today) + sum(1 for o in task_occs if o.completed_at and o.completed_at.date() == today)
        _analytics = _build_task_analytics(db, user_id, today, work_cats)
        _discipline = _build_discipline_metrics(db, user_id, today)
        return templates.TemplateResponse("tasks.html", {
            "request": request, "tasks": tasks, "task_templates": task_tmpls,
            "task_occurrences": task_occs, "work_categories": work_cats,
            "today": today, "error": msg, "reminder_presets": rem_presets,
            "enable_task_templates": _enable_tt, "task_presets": _presets,
            "today_tasks": _today_tasks, "upcoming_14": _upcoming,
            "no_date_tasks": _no_date, "later_tasks": _later,
            "done_tasks": _done, "recurring_items": _rec_items,
            "planned_today": _planned, "completed_today": _completed,
            "overdue_count": len(_overdue),
            "analytics": _analytics,
            "discipline": _discipline,
            "enable_reschedule_reasons": _user.enable_task_reschedule_reasons if _user else False,
            "reschedule_reasons": db.query(TaskRescheduleReason).filter(TaskRescheduleReason.user_id == user_id, TaskRescheduleReason.is_active == True).order_by(TaskRescheduleReason.sort_order, TaskRescheduleReason.id).all() if (_user and _user.enable_task_reschedule_reasons) else [],
        })

    try:
        if mode == "recurring":
            # Build by_weekday from checkboxes
            selected_days = []
            for code, val in [("MO", weekday_MO), ("TU", weekday_TU), ("WE", weekday_WE), ("TH", weekday_TH), ("FR", weekday_FR), ("SA", weekday_SA), ("SU", weekday_SU)]:
                if val:
                    selected_days.append(code)
            by_weekday = ",".join(selected_days) if selected_days else None

            if not freq:
                return _render_error("Выберите частоту повторения")
            if freq == "WEEKLY" and not selected_days:
                return _render_error("Для еженедельной задачи выберите хотя бы один день недели")
            if freq == "MONTHLY" and by_monthday is not None and (by_monthday < 1 or by_monthday > 31):
                return _render_error("День месяца должен быть от 1 до 31")
            if interval < 1:
                return _render_error("Интервал должен быть >= 1")
            if not start_date.strip():
                return _render_error("Укажите дату начала")

            # Ignore one-off fields
            CreateTaskTemplateUseCase(db).execute(
                account_id=user_id, title=title, freq=freq, interval=interval,
                start_date=start_date.strip(), note=note.strip() or None, category_id=category_id,
                by_weekday=by_weekday, by_monthday=by_monthday if freq == "MONTHLY" else None,
                actor_user_id=user_id,
                active_until=active_until.strip() or None,
            )
        else:
            # One-off task — parse DueSpec and reminders
            import json
            reminder_list = []
            if reminders.strip():
                try:
                    reminder_list = json.loads(reminders)
                except json.JSONDecodeError:
                    return _render_error("Некорректный формат напоминаний")

            # Task-expense link: check user setting
            _user = db.query(User).filter(User.id == user_id).first()
            _req_expense = bool(requires_expense) and _user and _user.enable_task_expense_link
            _sug_cat_id = suggested_expense_category_id if _req_expense else None
            _sug_amount = suggested_amount.strip() if _req_expense and suggested_amount else None

            # Multi-date creation: create N tasks (one per date)
            if multi_dates.strip():
                raw_dates = [d.strip() for d in multi_dates.split(",") if d.strip()]
                if not raw_dates:
                    return _render_error("Выберите хотя бы одну дату.")
                # Validate and deduplicate
                parsed_dates = []
                seen = set()
                for d in raw_dates:
                    try:
                        pd = date.fromisoformat(d)
                    except ValueError:
                        return _render_error(f"Некорректная дата: {d}")
                    if d not in seen:
                        seen.add(d)
                        parsed_dates.append(pd)
                parsed_dates.sort()
                for pd in parsed_dates:
                    CreateTaskUseCase(db).execute(
                        account_id=user_id, title=title, note=note.strip() or None,
                        due_kind="DATE",
                        due_date=pd.isoformat(),
                        due_time=None,
                        due_start_time=None,
                        due_end_time=None,
                        category_id=category_id, actor_user_id=user_id,
                        reminders=reminder_list or None,
                        requires_expense=_req_expense,
                        suggested_expense_category_id=_sug_cat_id,
                        suggested_amount=_sug_amount,
                    )
            else:
                CreateTaskUseCase(db).execute(
                    account_id=user_id, title=title, note=note.strip() or None,
                    due_kind=due_kind.strip() or "NONE",
                    due_date=due_date.strip() or None,
                    due_time=due_time.strip() or None,
                    due_start_time=due_start_time.strip() or None,
                    due_end_time=due_end_time.strip() or None,
                    category_id=category_id, actor_user_id=user_id,
                    reminders=reminder_list or None,
                    requires_expense=_req_expense,
                    suggested_expense_category_id=_sug_cat_id,
                    suggested_amount=_sug_amount,
                )
    except (TaskValidationError, TaskTemplateValidationError, DueSpecValidationError, ReminderSpecValidationError) as e:
        return _render_error(str(e))
    except Exception:
        db.rollback()
    return RedirectResponse(redirect or "/tasks", status_code=302)


@router.post("/tasks/{task_id}/complete")
def complete_task_form(request: Request, task_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        task = db.query(TaskModel).filter(
            TaskModel.task_id == task_id, TaskModel.account_id == user_id
        ).first()
        if not task:
            return RedirectResponse("/tasks", status_code=302)

        # Block normal completion if expense is required and feature is enabled
        _user = db.query(User).filter(User.id == user_id).first()
        if _user and _user.enable_task_expense_link and task.requires_expense:
            request.session["flash"] = {"message": "Эта задача требует создания расхода", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        today_msk = datetime.now(timezone(timedelta(hours=3))).date()
        xp_delta = preview_task_xp(task.due_date if task else None, today_msk)
        CompleteTaskUseCase(db).execute(task_id, user_id, actor_user_id=user_id)
        request.session["flash"] = {"message": f"🎉 +{xp_delta} XP"}
    except Exception:
        db.rollback()
    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/{task_id}/complete-with-expense")
def complete_task_with_expense(
    request: Request,
    task_id: int,
    expense_category_id: int = Form(...),
    expense_amount: str = Form(...),
    expense_wallet_id: int = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        # Validate user setting
        _user = db.query(User).filter(User.id == user_id).first()
        if not _user or not _user.enable_task_expense_link:
            request.session["flash"] = {"message": "Функция связки задач и расходов отключена", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        # Validate task
        task = db.query(TaskModel).filter(
            TaskModel.task_id == task_id, TaskModel.account_id == user_id
        ).first()
        if not task or task.status != "ACTIVE":
            request.session["flash"] = {"message": "Задача не найдена или уже выполнена", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        # Parse and validate amount
        from decimal import Decimal, InvalidOperation
        try:
            amount = Decimal(expense_amount)
        except (InvalidOperation, ValueError):
            request.session["flash"] = {"message": "Некорректная сумма", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        if amount <= 0:
            request.session["flash"] = {"message": "Сумма должна быть больше нуля", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        # Get wallet for currency
        wallet = db.query(WalletBalance).filter(
            WalletBalance.wallet_id == expense_wallet_id,
            WalletBalance.account_id == user_id,
        ).first()
        if not wallet:
            request.session["flash"] = {"message": "Кошелёк не найден", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        # Create expense transaction linked to task
        from app.application.transactions import CreateTransactionUseCase
        CreateTransactionUseCase(db).execute_expense(
            account_id=user_id,
            wallet_id=expense_wallet_id,
            amount=amount,
            currency=wallet.currency,
            category_id=expense_category_id,
            description=task.title,
            actor_user_id=user_id,
            task_id=task_id,
        )

        # Complete the task
        today_msk = datetime.now(timezone(timedelta(hours=3))).date()
        xp_delta = preview_task_xp(task.due_date, today_msk)
        CompleteTaskUseCase(db).execute(task_id, user_id, actor_user_id=user_id)
        request.session["flash"] = {"message": f"🎉 Расход создан, +{xp_delta} XP"}
    except Exception:
        db.rollback()
        request.session["flash"] = {"message": "Ошибка при создании расхода", "type": "error"}
    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/{task_id}/archive")
def archive_task_form(request: Request, task_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ArchiveTaskUseCase(db).execute(task_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/{task_id}/reschedule")
def reschedule_task_form(
    request: Request, task_id: int,
    new_due_date: str = Form(...),
    reason_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.enable_task_reschedule_reasons:
        return RedirectResponse("/tasks", status_code=302)

    task = db.query(TaskModel).filter(
        TaskModel.task_id == task_id, TaskModel.account_id == user_id,
    ).first()
    if not task:
        return RedirectResponse("/tasks", status_code=302)

    new_date_str = new_due_date.strip()
    if not new_date_str:
        return RedirectResponse("/tasks", status_code=302)

    try:
        new_date = date.fromisoformat(new_date_str)
    except ValueError:
        return RedirectResponse("/tasks", status_code=302)

    if not reason_id:
        return RedirectResponse("/tasks", status_code=302)

    # Verify reason belongs to this user and is active
    reason = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.id == reason_id,
        TaskRescheduleReason.user_id == user_id,
        TaskRescheduleReason.is_active == True,
    ).first()
    if not reason:
        return RedirectResponse("/tasks", status_code=302)

    old_due_date = task.due_date
    if old_due_date == new_date:
        return RedirectResponse("/tasks", status_code=302)

    # Update task via use case (writes event_log)
    from app.application.tasks_usecases import UpdateTaskUseCase
    UpdateTaskUseCase(db).execute(
        task_id=task_id, account_id=user_id,
        actor_user_id=user_id,
        due_date=new_date_str,
    )

    # Write reschedule log entry
    log_entry = TaskDueChangeLog(
        task_id=task_id, user_id=user_id,
        old_due_date=old_due_date, new_due_date=new_date,
        reason_id=reason_id,
    )
    db.add(log_entry)
    db.commit()

    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/occurrences/{occurrence_id}/complete")
def complete_task_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CompleteTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
        request.session["flash"] = {"message": "🎉 +10 XP"}
    except Exception:
        db.rollback()
    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/occurrences/{occurrence_id}/skip")
def skip_task_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/tasks", status_code=302)


# === Task Presets (quick templates) ===

@router.get("/task-presets", response_class=HTMLResponse)
def task_presets_list(request: Request, view: str = "active", db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    q = TaskPresetModel.account_id == user_id
    if view == "inactive":
        q_active = TaskPresetModel.is_active == False
    else:
        q_active = TaskPresetModel.is_active == True
    presets = db.query(TaskPresetModel).filter(q, q_active).order_by(
        TaskPresetModel.sort_order, TaskPresetModel.id
    ).all()
    return templates.TemplateResponse("task_presets_list.html", {
        "request": request, "presets": presets, "view": view,
    })


@router.get("/task-presets/new", response_class=HTMLResponse)
def task_preset_new_form(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    return templates.TemplateResponse("task_preset_form.html", {
        "request": request, "mode": "new", "work_categories": work_categories,
    })


@router.post("/task-presets/new", response_class=HTMLResponse)
def task_preset_create(
    request: Request,
    name: str = Form(...),
    title_template: str = Form(...),
    description_template: str = Form(""),
    default_task_category_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    name = name.strip()
    title_template = title_template.strip()
    if not name or not title_template:
        work_categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("task_preset_form.html", {
            "request": request, "mode": "new", "error": "Название и шаблон заголовка обязательны",
            "work_categories": work_categories,
            "form_name": name, "form_title_template": title_template,
            "form_description_template": description_template.strip(),
            "form_category_id": default_task_category_id,
        })

    # Determine sort_order (append to end)
    max_order = db.query(func.max(TaskPresetModel.sort_order)).filter(
        TaskPresetModel.account_id == user_id
    ).scalar() or 0

    preset = TaskPresetModel(
        account_id=user_id,
        name=name,
        title_template=title_template,
        description_template=description_template.strip() or None,
        default_task_category_id=default_task_category_id,
        sort_order=max_order + 1,
    )
    db.add(preset)
    db.commit()
    return RedirectResponse("/task-presets", status_code=302)


@router.get("/task-presets/{preset_id}/edit", response_class=HTMLResponse)
def task_preset_edit_form(request: Request, preset_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    preset = db.query(TaskPresetModel).filter(
        TaskPresetModel.id == preset_id, TaskPresetModel.account_id == user_id
    ).first()
    if not preset:
        return RedirectResponse("/task-presets", status_code=302)
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    return templates.TemplateResponse("task_preset_form.html", {
        "request": request, "mode": "edit", "preset": preset,
        "work_categories": work_categories,
    })


@router.post("/task-presets/{preset_id}/edit", response_class=HTMLResponse)
def task_preset_update(
    request: Request,
    preset_id: int,
    name: str = Form(...),
    title_template: str = Form(...),
    description_template: str = Form(""),
    default_task_category_id: int | None = Form(None),
    is_active: bool = Form(False),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    preset = db.query(TaskPresetModel).filter(
        TaskPresetModel.id == preset_id, TaskPresetModel.account_id == user_id
    ).first()
    if not preset:
        return RedirectResponse("/task-presets", status_code=302)

    name = name.strip()
    title_template = title_template.strip()
    if not name or not title_template:
        work_categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("task_preset_form.html", {
            "request": request, "mode": "edit", "preset": preset,
            "error": "Название и шаблон заголовка обязательны",
            "work_categories": work_categories,
        })

    preset.name = name
    preset.title_template = title_template
    preset.description_template = description_template.strip() or None
    preset.default_task_category_id = default_task_category_id
    preset.is_active = is_active
    db.commit()
    view = "active" if preset.is_active else "inactive"
    return RedirectResponse(f"/task-presets?view={view}", status_code=302)


@router.post("/task-presets/{preset_id}/move")
def task_preset_move(
    request: Request,
    preset_id: int,
    direction: str = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    preset = db.query(TaskPresetModel).filter(
        TaskPresetModel.id == preset_id, TaskPresetModel.account_id == user_id
    ).first()
    if not preset:
        return RedirectResponse("/task-presets", status_code=302)

    if direction == "up":
        neighbor = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.sort_order < preset.sort_order,
        ).order_by(TaskPresetModel.sort_order.desc()).first()
    else:
        neighbor = db.query(TaskPresetModel).filter(
            TaskPresetModel.account_id == user_id,
            TaskPresetModel.sort_order > preset.sort_order,
        ).order_by(TaskPresetModel.sort_order.asc()).first()

    if neighbor:
        preset.sort_order, neighbor.sort_order = neighbor.sort_order, preset.sort_order
        db.commit()

    return RedirectResponse("/task-presets", status_code=302)


# === Task Reschedule Reasons ===

@router.get("/task-reschedule-reasons", response_class=HTMLResponse)
def reschedule_reasons_list(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.enable_task_reschedule_reasons:
        return RedirectResponse("/tasks", status_code=302)

    view = request.query_params.get("view", "active")
    q = db.query(TaskRescheduleReason).filter(TaskRescheduleReason.user_id == user_id)
    if view == "archived":
        q = q.filter(TaskRescheduleReason.is_active == False)
    else:
        q = q.filter(TaskRescheduleReason.is_active == True)
    reasons = q.order_by(TaskRescheduleReason.sort_order, TaskRescheduleReason.id).all()
    return templates.TemplateResponse("reschedule_reasons_list.html", {
        "request": request, "reasons": reasons, "view": view,
    })


@router.get("/task-reschedule-reasons/new", response_class=HTMLResponse)
def reschedule_reason_new(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.enable_task_reschedule_reasons:
        return RedirectResponse("/tasks", status_code=302)
    return templates.TemplateResponse("reschedule_reason_form.html", {
        "request": request, "mode": "new",
    })


@router.post("/task-reschedule-reasons/new", response_class=HTMLResponse)
def reschedule_reason_create(
    request: Request,
    name: str = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    name = name.strip()
    if not name:
        return templates.TemplateResponse("reschedule_reason_form.html", {
            "request": request, "mode": "new", "error": "Название не может быть пустым",
            "form_name": name,
        })
    existing = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.user_id == user_id, TaskRescheduleReason.name == name,
    ).first()
    if existing:
        return templates.TemplateResponse("reschedule_reason_form.html", {
            "request": request, "mode": "new", "error": "Причина с таким названием уже существует",
            "form_name": name,
        })
    max_order = db.query(func.max(TaskRescheduleReason.sort_order)).filter(
        TaskRescheduleReason.user_id == user_id
    ).scalar() or 0
    reason = TaskRescheduleReason(user_id=user_id, name=name, sort_order=max_order + 1)
    db.add(reason)
    db.commit()
    return RedirectResponse("/task-reschedule-reasons", status_code=302)


@router.get("/task-reschedule-reasons/{reason_id}/edit", response_class=HTMLResponse)
def reschedule_reason_edit(request: Request, reason_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    reason = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.id == reason_id, TaskRescheduleReason.user_id == user_id,
    ).first()
    if not reason:
        return RedirectResponse("/task-reschedule-reasons", status_code=302)
    return templates.TemplateResponse("reschedule_reason_form.html", {
        "request": request, "mode": "edit", "reason": reason,
    })


@router.post("/task-reschedule-reasons/{reason_id}/edit", response_class=HTMLResponse)
def reschedule_reason_update(
    request: Request, reason_id: int,
    name: str = Form(...),
    is_active: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    reason = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.id == reason_id, TaskRescheduleReason.user_id == user_id,
    ).first()
    if not reason:
        return RedirectResponse("/task-reschedule-reasons", status_code=302)
    name = name.strip()
    if not name:
        return templates.TemplateResponse("reschedule_reason_form.html", {
            "request": request, "mode": "edit", "reason": reason,
            "error": "Название не может быть пустым",
        })
    dup = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.user_id == user_id,
        TaskRescheduleReason.name == name,
        TaskRescheduleReason.id != reason_id,
    ).first()
    if dup:
        return templates.TemplateResponse("reschedule_reason_form.html", {
            "request": request, "mode": "edit", "reason": reason,
            "error": "Причина с таким названием уже существует",
        })
    reason.name = name
    reason.is_active = bool(is_active)
    db.commit()
    return RedirectResponse("/task-reschedule-reasons", status_code=302)


@router.post("/task-reschedule-reasons/{reason_id}/move")
def reschedule_reason_move(
    request: Request, reason_id: int,
    direction: str = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    reason = db.query(TaskRescheduleReason).filter(
        TaskRescheduleReason.id == reason_id, TaskRescheduleReason.user_id == user_id,
    ).first()
    if not reason:
        return RedirectResponse("/task-reschedule-reasons", status_code=302)
    if direction == "up":
        neighbor = db.query(TaskRescheduleReason).filter(
            TaskRescheduleReason.user_id == user_id,
            TaskRescheduleReason.sort_order < reason.sort_order,
        ).order_by(TaskRescheduleReason.sort_order.desc()).first()
    else:
        neighbor = db.query(TaskRescheduleReason).filter(
            TaskRescheduleReason.user_id == user_id,
            TaskRescheduleReason.sort_order > reason.sort_order,
        ).order_by(TaskRescheduleReason.sort_order.asc()).first()
    if neighbor:
        reason.sort_order, neighbor.sort_order = neighbor.sort_order, reason.sort_order
        db.commit()
    return RedirectResponse("/task-reschedule-reasons", status_code=302)


# === Projects ===

@router.get("/projects", response_class=HTMLResponse)
def projects_list(request: Request, status: str | None = None, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = ProjectReadService(db)
    projects = svc.list_projects(user_id, status_filter=status)
    return templates.TemplateResponse("projects.html", {
        "request": request,
        "projects": projects,
        "status_filter": status,
        "all_statuses": PROJECT_STATUSES,
    })


@router.get("/projects/create", response_class=HTMLResponse)
def project_create_form(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("project_form.html", {
        "request": request,
        "project": None,
        "error": None,
        "all_statuses": PROJECT_STATUSES,
    })


@router.post("/projects/create")
def project_create(
    request: Request,
    title: str = Form(""),
    description: str = Form(""),
    status: str = Form("planned"),
    start_date: str = Form(""),
    due_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        sd = date.fromisoformat(start_date) if start_date else None
        dd = date.fromisoformat(due_date) if due_date else None
        pid = CreateProjectUseCase(db).execute(
            account_id=user_id, title=title, description=description,
            status=status, start_date=sd, due_date=dd,
        )
        return RedirectResponse(f"/projects/{pid}", status_code=302)
    except (ProjectValidationError, ValueError) as e:
        return templates.TemplateResponse("project_form.html", {
            "request": request,
            "project": None,
            "error": str(e),
            "all_statuses": PROJECT_STATUSES,
        })


@router.get("/projects/{project_id}", response_class=HTMLResponse)
def project_detail(request: Request, project_id: int, tag: int | None = None, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = ProjectReadService(db)
    detail = svc.get_project_detail(project_id, user_id, tag_filter=tag)
    if not detail:
        return RedirectResponse("/projects", status_code=302)
    unassigned = svc.get_unassigned_tasks(user_id)
    related_articles = KnowledgeReadService(db).get_articles_for_entity(user_id, "project", project_id)
    active_tag_filter = None
    if tag:
        for pt in detail.get("project_tags", []):
            if pt["id"] == tag:
                active_tag_filter = pt
                break
    return templates.TemplateResponse("project_detail.html", {
        "request": request,
        "project": detail,
        "unassigned_tasks": unassigned,
        "related_articles": related_articles,
        "all_statuses": PROJECT_STATUSES,
        "board_statuses": BOARD_STATUSES,
        "active_tag_filter": active_tag_filter,
    })


@router.get("/projects/{project_id}/edit", response_class=HTMLResponse)
def project_edit_form(request: Request, project_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    project = db.query(ProjectModel).filter(
        ProjectModel.id == project_id,
        ProjectModel.account_id == user_id,
    ).first()
    if not project:
        return RedirectResponse("/projects", status_code=302)
    return templates.TemplateResponse("project_form.html", {
        "request": request,
        "project": project,
        "error": None,
        "all_statuses": PROJECT_STATUSES,
    })


@router.post("/projects/{project_id}/edit")
def project_edit(
    request: Request,
    project_id: int,
    title: str = Form(""),
    description: str = Form(""),
    status: str = Form("planned"),
    start_date: str = Form(""),
    due_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        sd = date.fromisoformat(start_date) if start_date else None
        dd = date.fromisoformat(due_date) if due_date else None
        UpdateProjectUseCase(db).execute(
            project_id=project_id, account_id=user_id,
            title=title, description=description, status=status,
            start_date=sd, due_date=dd,
        )
        return RedirectResponse(f"/projects/{project_id}", status_code=302)
    except (ProjectValidationError, ValueError) as e:
        project = db.query(ProjectModel).filter(
            ProjectModel.id == project_id,
            ProjectModel.account_id == user_id,
        ).first()
        return templates.TemplateResponse("project_form.html", {
            "request": request,
            "project": project,
            "error": str(e),
            "all_statuses": PROJECT_STATUSES,
        })


@router.post("/projects/{project_id}/status")
def project_change_status(
    request: Request,
    project_id: int,
    status: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        ChangeProjectStatusUseCase(db).execute(project_id, user_id, status)
    except ProjectValidationError:
        pass
    return RedirectResponse(f"/projects/{project_id}", status_code=302)


@router.get("/projects/{project_id}/tasks/create", response_class=HTMLResponse)
def project_task_create_form(request: Request, project_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = ProjectReadService(db)
    detail = svc.get_project_detail(project_id, user_id)
    if not detail:
        return RedirectResponse("/projects", status_code=302)
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    return templates.TemplateResponse("project_task_form.html", {
        "request": request,
        "project": detail,
        "work_categories": work_categories,
        "error": None,
    })


@router.post("/projects/{project_id}/tasks/create")
def project_task_create(
    request: Request,
    project_id: int,
    title: str = Form(""),
    note: str = Form(""),
    due_kind: str = Form("NONE"),
    due_date: str = Form(""),
    due_time: str = Form(""),
    category_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateTaskInProjectUseCase(db).execute(
            account_id=user_id,
            project_id=project_id,
            title=title,
            note=note.strip() or None,
            due_kind=due_kind.strip() or "NONE",
            due_date=due_date.strip() or None,
            due_time=due_time.strip() or None,
            category_id=category_id,
        )
        return RedirectResponse(f"/projects/{project_id}", status_code=302)
    except (ProjectValidationError, Exception) as e:
        svc = ProjectReadService(db)
        detail = svc.get_project_detail(project_id, user_id)
        if not detail:
            return RedirectResponse("/projects", status_code=302)
        work_categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("project_task_form.html", {
            "request": request,
            "project": detail,
            "work_categories": work_categories,
            "error": str(e),
        })


@router.post("/tasks/{task_id}/assign")
def task_assign_to_project(
    request: Request,
    task_id: int,
    project_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    pid = project_id if project_id else None
    redirect_to = f"/projects/{project_id}" if pid else "/projects"
    try:
        AssignTaskToProjectUseCase(db).execute(task_id, user_id, pid)
    except ProjectValidationError:
        pass
    return RedirectResponse(redirect_to, status_code=302)


@router.post("/tasks/{task_id}/board-status")
def task_change_board_status(
    request: Request,
    task_id: int,
    board_status: str = Form(""),
    project_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    redirect_to = f"/projects/{project_id}" if project_id else "/projects"
    try:
        ChangeTaskBoardStatusUseCase(db).execute(task_id, user_id, board_status)
    except ProjectValidationError:
        pass
    return RedirectResponse(redirect_to, status_code=302)


# === Project Tags ===

@router.get("/projects/{project_id}/tags", response_class=HTMLResponse)
def project_tags_page(request: Request, project_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = ProjectReadService(db)
    detail = svc.get_project_detail(project_id, user_id)
    if not detail:
        return RedirectResponse("/projects", status_code=302)
    tags = svc.get_project_tags(project_id, user_id)
    return templates.TemplateResponse("project_tags.html", {
        "request": request,
        "project": detail,
        "tags": tags,
        "tag_colors": TAG_COLORS,
        "error": None,
    })


@router.post("/projects/{project_id}/tags")
def project_tag_create(
    request: Request,
    project_id: int,
    name: str = Form(""),
    color: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateProjectTagUseCase(db).execute(project_id, user_id, name, color or None)
    except ProjectValidationError as e:
        svc = ProjectReadService(db)
        detail = svc.get_project_detail(project_id, user_id)
        if not detail:
            return RedirectResponse("/projects", status_code=302)
        tags = svc.get_project_tags(project_id, user_id)
        return templates.TemplateResponse("project_tags.html", {
            "request": request,
            "project": detail,
            "tags": tags,
            "tag_colors": TAG_COLORS,
            "error": str(e),
        })
    return RedirectResponse(f"/projects/{project_id}/tags", status_code=302)


@router.post("/projects/{project_id}/tags/{tag_id}/edit")
def project_tag_edit(
    request: Request,
    project_id: int,
    tag_id: int,
    name: str = Form(""),
    color: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        UpdateProjectTagUseCase(db).execute(tag_id, project_id, user_id, name=name or None, color=color or None)
    except ProjectValidationError:
        pass
    return RedirectResponse(f"/projects/{project_id}/tags", status_code=302)


@router.post("/projects/{project_id}/tags/{tag_id}/delete")
def project_tag_delete(
    request: Request,
    project_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        DeleteProjectTagUseCase(db).execute(tag_id, project_id, user_id)
    except ProjectValidationError:
        pass
    return RedirectResponse(f"/projects/{project_id}/tags", status_code=302)


@router.post("/projects/{project_id}/tasks/{task_id}/tags/add")
def task_tag_add(
    request: Request,
    project_id: int,
    task_id: int,
    project_tag_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    if project_tag_id:
        try:
            AddTagToTaskUseCase(db).execute(task_id, project_tag_id, project_id, user_id)
        except ProjectValidationError:
            pass
    return RedirectResponse(f"/projects/{project_id}", status_code=302)


@router.post("/projects/{project_id}/tasks/{task_id}/tags/remove")
def task_tag_remove(
    request: Request,
    project_id: int,
    task_id: int,
    project_tag_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    if project_tag_id:
        try:
            RemoveTagFromTaskUseCase(db).execute(task_id, project_tag_id, project_id, user_id)
        except ProjectValidationError:
            pass
    return RedirectResponse(f"/projects/{project_id}", status_code=302)


# === Knowledge Base ===

@router.get("/knowledge", response_class=HTMLResponse)
def knowledge_list(
    request: Request,
    type: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = KnowledgeReadService(db)
    articles = svc.list_articles(
        user_id, type_filter=type, status_filter=status,
        tag_filter=tag, search=q,
    )
    all_tags = svc.get_all_tags(user_id)
    return templates.TemplateResponse("knowledge_list.html", {
        "request": request,
        "articles": articles,
        "type_filter": type,
        "status_filter": status,
        "tag_filter": tag,
        "search_query": q or "",
        "all_types": ARTICLE_TYPES,
        "all_statuses": ARTICLE_STATUSES,
        "all_tags": all_tags,
    })


@router.get("/knowledge/create", response_class=HTMLResponse)
def knowledge_create_form(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("knowledge_form.html", {
        "request": request,
        "article": None,
        "error": None,
        "all_types": ARTICLE_TYPES,
        "all_statuses": ARTICLE_STATUSES,
    })


@router.post("/knowledge/create")
def knowledge_create(
    request: Request,
    title: str = Form(""),
    content_md: str = Form(""),
    type: str = Form("note"),
    status: str = Form("draft"),
    pinned: str = Form(""),
    tags: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        aid = CreateArticleUseCase(db).execute(
            account_id=user_id, title=title, content_md=content_md,
            type=type, status=status, pinned=bool(pinned),
            tags_csv=tags,
        )
        return RedirectResponse(f"/knowledge/{aid}", status_code=302)
    except (KnowledgeValidationError, ValueError) as e:
        return templates.TemplateResponse("knowledge_form.html", {
            "request": request,
            "article": None,
            "error": str(e),
            "all_types": ARTICLE_TYPES,
            "all_statuses": ARTICLE_STATUSES,
        })


@router.get("/knowledge/{article_id}", response_class=HTMLResponse)
def knowledge_view(request: Request, article_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    svc = KnowledgeReadService(db)
    detail = svc.get_article_detail(article_id, user_id)
    if not detail:
        return RedirectResponse("/knowledge", status_code=302)
    all_projects = (
        db.query(ProjectModel)
        .filter(ProjectModel.account_id == user_id, ProjectModel.status != "archived")
        .order_by(ProjectModel.title)
        .all()
    )
    linked_ids = {p["id"] for p in detail["linked_projects"]}
    available_projects = [
        {"id": p.id, "title": p.title} for p in all_projects if p.id not in linked_ids
    ]
    return templates.TemplateResponse("knowledge_view.html", {
        "request": request,
        "article": detail,
        "available_projects": available_projects,
    })


@router.get("/knowledge/{article_id}/edit", response_class=HTMLResponse)
def knowledge_edit_form(request: Request, article_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    detail = KnowledgeReadService(db).get_article_detail(article_id, user_id)
    if not detail:
        return RedirectResponse("/knowledge", status_code=302)
    return templates.TemplateResponse("knowledge_form.html", {
        "request": request,
        "article": detail,
        "error": None,
        "all_types": ARTICLE_TYPES,
        "all_statuses": ARTICLE_STATUSES,
    })


@router.post("/knowledge/{article_id}/edit")
def knowledge_edit(
    request: Request,
    article_id: int,
    title: str = Form(""),
    content_md: str = Form(""),
    type: str = Form("note"),
    status: str = Form("draft"),
    pinned: str = Form(""),
    tags: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        UpdateArticleUseCase(db).execute(
            article_id=article_id, account_id=user_id,
            title=title, content_md=content_md, type=type,
            status=status, pinned=bool(pinned), tags_csv=tags,
        )
        return RedirectResponse(f"/knowledge/{article_id}", status_code=302)
    except (KnowledgeValidationError, ValueError) as e:
        detail = KnowledgeReadService(db).get_article_detail(article_id, user_id)
        return templates.TemplateResponse("knowledge_form.html", {
            "request": request,
            "article": detail,
            "error": str(e),
            "all_types": ARTICLE_TYPES,
            "all_statuses": ARTICLE_STATUSES,
        })


@router.post("/knowledge/{article_id}/delete")
def knowledge_delete(request: Request, article_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        DeleteArticleUseCase(db).execute(article_id, user_id)
    except KnowledgeValidationError:
        pass
    return RedirectResponse("/knowledge", status_code=302)


@router.post("/knowledge/{article_id}/status")
def knowledge_change_status(
    request: Request,
    article_id: int,
    status: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        UpdateArticleUseCase(db).execute(
            article_id=article_id, account_id=user_id, status=status,
        )
    except KnowledgeValidationError:
        pass
    return RedirectResponse(f"/knowledge/{article_id}", status_code=302)


@router.post("/knowledge/{article_id}/attach")
def knowledge_attach(
    request: Request,
    article_id: int,
    project_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    if project_id:
        try:
            AttachArticleToProjectUseCase(db).execute(article_id, user_id, project_id)
        except KnowledgeValidationError:
            pass
    return RedirectResponse(f"/knowledge/{article_id}", status_code=302)


@router.post("/knowledge/{article_id}/detach")
def knowledge_detach(
    request: Request,
    article_id: int,
    project_id: int = Form(0),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    if project_id:
        try:
            DetachArticleFromProjectUseCase(db).execute(article_id, user_id, project_id)
        except KnowledgeValidationError:
            pass
    return RedirectResponse(f"/knowledge/{article_id}", status_code=302)


# === Habits ===

@router.get("/habits", response_class=HTMLResponse)
def habits_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    gen = OccurrenceGenerator(db)
    gen.generate_habit_occurrences(user_id)

    today = date.today()
    today_data = get_today_habits(db, user_id, today)
    analytics = get_habits_analytics(db, user_id, today)
    grid_data = get_habits_grid(db, user_id, today)
    heatmap = get_global_heatmap(db, user_id, today)
    milestones = get_recent_milestones(db, user_id, limit=5)

    return templates.TemplateResponse("habits.html", {
        "request": request, "today": today,
        "today_data": today_data, "analytics": analytics, "grid_data": grid_data,
        "heatmap": heatmap, "milestones": milestones,
    })


@router.get("/habits/new", response_class=HTMLResponse)
def habits_new_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    return templates.TemplateResponse("habits_new.html", {
        "request": request, "work_categories": work_categories,
        "today": date.today(), "error": None,
    })


@router.get("/habits/archive", response_class=HTMLResponse)
def habits_archive_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    habits = db.query(HabitModel).filter(
        HabitModel.account_id == user_id, HabitModel.is_archived == True,
    ).order_by(HabitModel.title).all()
    return templates.TemplateResponse("habits_archive.html", {
        "request": request, "habits": habits,
    })


@router.post("/habits/create")
def create_habit_form(
    request: Request,
    title: str = Form(...),
    freq: str = Form(...),
    interval: int = Form(1),
    start_date: str = Form(...),
    by_monthday: int | None = Form(None),
    weekday_MO: str = Form(""), weekday_TU: str = Form(""), weekday_WE: str = Form(""),
    weekday_TH: str = Form(""), weekday_FR: str = Form(""), weekday_SA: str = Form(""),
    weekday_SU: str = Form(""),
    category_id: int | None = Form(None),
    level: int = Form(1),
    note: str = Form(""),
    active_until: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    selected_days = []
    for code, val in [("MO", weekday_MO), ("TU", weekday_TU), ("WE", weekday_WE), ("TH", weekday_TH), ("FR", weekday_FR), ("SA", weekday_SA), ("SU", weekday_SU)]:
        if val:
            selected_days.append(code)
    by_weekday = ",".join(selected_days) if selected_days else None

    try:
        CreateHabitUseCase(db).execute(
            account_id=user_id, title=title, freq=freq, interval=interval,
            start_date=start_date, note=note.strip() or None, category_id=category_id,
            by_weekday=by_weekday, by_monthday=by_monthday if freq == "MONTHLY" else None,
            level=level, actor_user_id=user_id,
            active_until=active_until.strip() or None,
        )
    except (HabitValidationError, Exception) as e:
        db.rollback()
        work_categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("habits_new.html", {
            "request": request, "work_categories": work_categories,
            "today": date.today(), "error": str(e),
        })
    return RedirectResponse("/habits", status_code=302)


@router.post("/habits/{habit_id}/archive")
def archive_habit_form(request: Request, habit_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ArchiveHabitUseCase(db).execute(habit_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/habits", status_code=302)


@router.post("/habits/{habit_id}/unarchive")
def unarchive_habit_form(request: Request, habit_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        UnarchiveHabitUseCase(db).execute(habit_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/habits/archive", status_code=302)


@router.post("/habits/occurrences/{occurrence_id}/toggle")
def toggle_habit_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ToggleHabitOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/habits", status_code=302)


@router.post("/habits/occurrences/{occurrence_id}/complete")
def complete_habit_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CompleteHabitOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
        request.session["flash"] = {"message": "🎉 +3 XP"}
    except Exception:
        db.rollback()
    return RedirectResponse("/habits", status_code=302)


@router.post("/habits/occurrences/{occurrence_id}/skip")
def skip_habit_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipHabitOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/habits", status_code=302)


@router.post("/habits/occurrences/{occurrence_id}/reset")
def reset_habit_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ResetHabitOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/habits", status_code=302)


# === Planned Operations ===

OP_KIND_LABELS = {"INCOME": "Доход", "EXPENSE": "Расход"}
OP_FREQ_LABELS = {
    "MONTHLY": "ежемесячно", "WEEKLY": "еженедельно",
    "DAILY": "ежедневно", "YEARLY": "ежегодно",
    "INTERVAL_DAYS": "интервал",
}


@router.get("/planned-ops", response_class=HTMLResponse)
def planned_ops_list(
    request: Request,
    view: str = "active",
    q: str = "",
    kind_filter: str = "",
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    query = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.account_id == user_id,
    )
    if view == "archived":
        query = query.filter(OperationTemplateModel.is_archived == True)
    else:
        query = query.filter(OperationTemplateModel.is_archived == False)
    if q:
        query = query.filter(OperationTemplateModel.title.ilike(f"%{q}%"))
    if kind_filter in ("INCOME", "EXPENSE"):
        query = query.filter(OperationTemplateModel.kind == kind_filter)

    op_templates = query.order_by(OperationTemplateModel.title).all()

    # Build rule map for frequency display
    rule_ids = [t.rule_id for t in op_templates if t.rule_id]
    rules = db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all() if rule_ids else []
    rule_map = {r.rule_id: r for r in rules}

    # Wallet and category maps for display
    wallets = db.query(WalletBalance).filter(WalletBalance.account_id == user_id).all()
    wallet_map = {w.wallet_id: w for w in wallets}
    fin_categories = db.query(CategoryInfo).filter(CategoryInfo.account_id == user_id).all()
    cat_map = {c.category_id: c for c in fin_categories}

    return templates.TemplateResponse("planned_ops_list.html", {
        "request": request,
        "templates_list": op_templates,
        "rule_map": rule_map,
        "wallet_map": wallet_map,
        "cat_map": cat_map,
        "kind_labels": OP_KIND_LABELS,
        "freq_labels": OP_FREQ_LABELS,
        "view": view,
        "q": q,
        "kind_filter": kind_filter,
    })


@router.get("/planned-ops/upcoming", response_class=HTMLResponse)
def planned_ops_upcoming(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    gen = OccurrenceGenerator(db)
    gen.generate_operation_occurrences(user_id)

    today = date.today()
    all_occs = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == user_id,
        OperationOccurrence.scheduled_date >= today - timedelta(days=30),
        OperationOccurrence.scheduled_date <= today + timedelta(days=90),
    ).order_by(OperationOccurrence.scheduled_date.asc()).all()

    # Template map
    tmpl_ids = list({o.template_id for o in all_occs})
    tmpls = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id.in_(tmpl_ids)
    ).all() if tmpl_ids else []
    tmpl_map = {t.template_id: t for t in tmpls}

    active_occs = [o for o in all_occs if o.status == "ACTIVE"]
    done_occs = [o for o in all_occs if o.status != "ACTIVE"]

    return templates.TemplateResponse("planned_ops_upcoming.html", {
        "request": request,
        "active_occs": active_occs,
        "done_occs": done_occs,
        "tmpl_map": tmpl_map,
        "kind_labels": OP_KIND_LABELS,
        "today": today,
    })


@router.get("/planned-ops/new", response_class=HTMLResponse)
def planned_op_new_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
        WalletBalance.wallet_type != "CREDIT",
    ).order_by(WalletBalance.title).all()
    fin_categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
    ).order_by(CategoryInfo.title).all()

    return templates.TemplateResponse("planned_op_form.html", {
        "request": request,
        "mode": "new",
        "wallets": wallets,
        "fin_categories": fin_categories,
        "today": date.today(),
    })


@router.post("/planned-ops/new")
def planned_op_create(
    request: Request,
    title: str = Form(...),
    kind: str = Form(...),
    amount: str = Form(...),
    wallet_id: int | None = Form(None),
    destination_wallet_id: int | None = Form(None),
    category_id: int | None = Form(None),
    freq: str = Form(...),
    interval: int = Form(1),
    start_date: str = Form(...),
    by_monthday: int | None = Form(None),
    note: str = Form(""),
    active_until: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateOperationTemplateUseCase(db).execute(
            account_id=user_id, title=title, freq=freq, interval=interval,
            start_date=start_date, kind=kind, amount=amount,
            wallet_id=wallet_id, destination_wallet_id=destination_wallet_id,
            category_id=category_id, note=note.strip() or None,
            by_monthday=by_monthday, actor_user_id=user_id,
            active_until=active_until.strip() or None,
        )
        return RedirectResponse("/planned-ops", status_code=302)
    except (OperationTemplateValidationError, Exception) as e:
        db.rollback()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
            WalletBalance.wallet_type != "CREDIT",
        ).order_by(WalletBalance.title).all()
        fin_categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
        ).order_by(CategoryInfo.title).all()
        return templates.TemplateResponse("planned_op_form.html", {
            "request": request,
            "mode": "new",
            "wallets": wallets,
            "fin_categories": fin_categories,
            "today": date.today(),
            "error": str(e),
            "form_title": title, "form_kind": kind, "form_amount": amount,
            "form_wallet_id": wallet_id, "form_destination_wallet_id": destination_wallet_id,
            "form_category_id": category_id, "form_freq": freq, "form_interval": interval,
            "form_start_date": start_date, "form_by_monthday": by_monthday,
            "form_note": note, "form_active_until": active_until,
        })


@router.get("/planned-ops/{template_id}/edit", response_class=HTMLResponse)
def planned_op_edit_page(request: Request, template_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    tmpl = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id == template_id,
        OperationTemplateModel.account_id == user_id,
    ).first()
    if not tmpl:
        return RedirectResponse("/planned-ops", status_code=302)

    rule = db.query(RecurrenceRuleModel).filter(
        RecurrenceRuleModel.rule_id == tmpl.rule_id,
    ).first()

    has_confirmed = db.query(OperationOccurrence).filter(
        OperationOccurrence.template_id == template_id,
        OperationOccurrence.account_id == user_id,
        OperationOccurrence.status.in_(["DONE", "SKIPPED"]),
    ).first() is not None

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
        WalletBalance.wallet_type != "CREDIT",
    ).order_by(WalletBalance.title).all()
    fin_categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
    ).order_by(CategoryInfo.title).all()

    return templates.TemplateResponse("planned_op_form.html", {
        "request": request,
        "mode": "edit",
        "tmpl": tmpl,
        "rule": rule,
        "has_confirmed": has_confirmed,
        "wallets": wallets,
        "fin_categories": fin_categories,
        "today": date.today(),
    })


@router.post("/planned-ops/{template_id}/edit")
def planned_op_update(
    request: Request,
    template_id: int,
    title: str = Form(...),
    kind: str = Form(...),
    amount: str = Form(...),
    wallet_id: int | None = Form(None),
    destination_wallet_id: int | None = Form(None),
    category_id: int | None = Form(None),
    note: str = Form(""),
    active_until: str = Form(""),
    is_archived: str = Form(""),
    version_from_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    tmpl = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id == template_id,
        OperationTemplateModel.account_id == user_id,
    ).first()
    if not tmpl:
        return RedirectResponse("/planned-ops", status_code=302)

    try:
        want_archived = is_archived == "on"

        # 1. Unarchive first if needed
        if tmpl.is_archived and not want_archived:
            UnarchiveOperationTemplateUseCase(db).execute(template_id, user_id, actor_user_id=user_id)
            tmpl = db.query(OperationTemplateModel).filter(
                OperationTemplateModel.template_id == template_id,
            ).first()

        # 2. Update fields
        UpdateOperationTemplateUseCase(db).execute(
            template_id=template_id,
            account_id=user_id,
            actor_user_id=user_id,
            version_from_date=version_from_date or None,
            title=title.strip(),
            kind=kind,
            amount=amount,
            wallet_id=wallet_id,
            destination_wallet_id=destination_wallet_id,
            category_id=category_id,
            note=note.strip() or None,
            active_until=active_until.strip() or None,
        )

        # Reload after update
        tmpl = db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == template_id,
        ).first()

        # 3. Archive last if needed
        if tmpl and not tmpl.is_archived and want_archived:
            ArchiveOperationTemplateUseCase(db).execute(template_id, user_id, actor_user_id=user_id)

        redirect_view = "archived" if want_archived else "active"
        return RedirectResponse(f"/planned-ops?view={redirect_view}", status_code=302)

    except (OperationTemplateValidationError, Exception) as e:
        db.rollback()
        tmpl = db.query(OperationTemplateModel).filter(
            OperationTemplateModel.template_id == template_id,
            OperationTemplateModel.account_id == user_id,
        ).first()
        rule = db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == tmpl.rule_id,
        ).first() if tmpl else None
        has_confirmed = db.query(OperationOccurrence).filter(
            OperationOccurrence.template_id == template_id,
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.status.in_(["DONE", "SKIPPED"]),
        ).first() is not None
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
            WalletBalance.wallet_type != "CREDIT",
        ).order_by(WalletBalance.title).all()
        fin_categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
        ).order_by(CategoryInfo.title).all()
        return templates.TemplateResponse("planned_op_form.html", {
            "request": request,
            "mode": "edit",
            "tmpl": tmpl,
            "rule": rule,
            "has_confirmed": has_confirmed,
            "wallets": wallets,
            "fin_categories": fin_categories,
            "today": date.today(),
            "error": str(e),
        })


@router.post("/planned-ops/occurrences/{occurrence_id}/confirm")
def confirm_op_occurrence(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ConfirmOperationOccurrenceUseCase(db).execute(
            occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"],
        )
    except Exception:
        db.rollback()
    return RedirectResponse("/planned-ops/upcoming", status_code=302)


@router.post("/planned-ops/occurrences/{occurrence_id}/skip")
def skip_op_occurrence(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipOperationOccurrenceUseCase(db).execute(
            occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"],
        )
    except Exception:
        db.rollback()
    return RedirectResponse("/planned-ops/upcoming", status_code=302)


# === Subscriptions ===

MONTH_NAMES_RU = {
    1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
    5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
    9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
}


@router.get("/subscriptions", response_class=HTMLResponse)
def subscriptions_list(
    request: Request,
    view: str = "active",
    q: str = "",
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    query = db.query(SubscriptionModel).filter(
        SubscriptionModel.account_id == user_id,
    )
    if view == "archived":
        query = query.filter(SubscriptionModel.is_archived == True)
    else:
        query = query.filter(SubscriptionModel.is_archived == False)

    if q:
        query = query.filter(SubscriptionModel.name.ilike(f"%{q}%"))

    subs = query.order_by(SubscriptionModel.name).all()

    # Category map for display
    cats = db.query(CategoryInfo).filter(CategoryInfo.account_id == user_id).all()
    cat_map = {c.category_id: c for c in cats}

    # Members count per subscription
    member_counts = {}
    for s in subs:
        cnt = db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.subscription_id == s.id,
            SubscriptionMemberModel.is_archived == False,
        ).count()
        member_counts[s.id] = cnt

    # Progress bars data
    sub_ids = [s.id for s in subs]
    overview_map = compute_subscriptions_overview(db, user_id, sub_ids)

    return templates.TemplateResponse("subscriptions_list.html", {
        "request": request,
        "subs": subs,
        "cat_map": cat_map,
        "member_counts": member_counts,
        "overview_map": overview_map,
        "view": view,
        "q": q,
    })


@router.get("/subscriptions/new", response_class=HTMLResponse)
def subscription_new_page(
    request: Request,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    cats = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
    ).all()
    expense_cats = [c for c in cats if c.category_type == "EXPENSE"]
    income_cats = [c for c in cats if c.category_type == "INCOME"]

    return templates.TemplateResponse("subscription_form.html", {
        "request": request,
        "mode": "new",
        "sub": None,
        "expense_cats": expense_cats,
        "income_cats": income_cats,
        "members": [],
        "error": "",
    })


@router.post("/subscriptions/new", response_class=HTMLResponse)
def subscription_create(
    request: Request,
    name: str = Form(...),
    expense_category_id: int = Form(...),
    income_category_id: int = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        CreateSubscriptionUseCase(db).execute(
            account_id=user_id,
            name=name,
            expense_category_id=expense_category_id,
            income_category_id=income_category_id,
        )
        return RedirectResponse("/subscriptions", status_code=302)
    except SubscriptionValidationError as e:
        db.rollback()
        cats = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.is_archived == False,
        ).all()
        return templates.TemplateResponse("subscription_form.html", {
            "request": request,
            "mode": "new",
            "sub": None,
            "expense_cats": [c for c in cats if c.category_type == "EXPENSE"],
            "income_cats": [c for c in cats if c.category_type == "INCOME"],
            "members": [],
            "error": str(e),
        })


@router.get("/subscriptions/{sub_id}", response_class=HTMLResponse)
def subscription_detail_page(
    request: Request,
    sub_id: int,
    month: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id,
        SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        return RedirectResponse("/subscriptions", status_code=302)

    # Parse selected month
    if month:
        try:
            selected = date.fromisoformat(month + "-01")
        except ValueError:
            selected = date.today().replace(day=1)
    else:
        selected = date.today().replace(day=1)

    detail = compute_subscription_detail(db, sub, selected)
    analytics = compute_subscription_analytics(db, sub)

    # Nav months
    prev_m = selected.month - 2
    prev_month = date(selected.year + prev_m // 12, prev_m % 12 + 1, 1)
    next_m = selected.month
    next_month = date(selected.year + next_m // 12, next_m % 12 + 1, 1)

    # Category map for display
    cats = db.query(CategoryInfo).filter(CategoryInfo.account_id == user_id).all()
    cat_map = {c.category_id: c for c in cats}

    # Members for initial coverage form
    members = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.subscription_id == sub.id,
        SubscriptionMemberModel.is_archived == False,
    ).all()
    # contact_map is already inside detail (from compute_subscription_detail)
    contact_map = detail.get("contact_map", {})
    members.sort(key=lambda m: (contact_map.get(m.contact_id) and contact_map[m.contact_id].name or "").lower())

    # Wallets for extend/compensate forms (exclude SAVINGS)
    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False,
        WalletBalance.wallet_type != "SAVINGS",
    ).all()

    success = request.query_params.get("success", "")

    return templates.TemplateResponse("subscription_detail.html", {
        "request": request,
        "sub": sub,
        "selected": selected,
        "selected_label": f"{MONTH_NAMES_RU[selected.month]} {selected.year}",
        "prev_month": prev_month.strftime("%Y-%m"),
        "next_month": next_month.strftime("%Y-%m"),
        "detail": detail,
        "analytics": analytics,
        "cat_map": cat_map,
        "month_names": MONTH_NAMES_RU,
        "members": members,
        "contact_map": contact_map,
        "wallets": wallets,
        "error": error,
        "success": success,
    })


@router.post("/subscriptions/{sub_id}/initial-coverage")
def subscription_add_initial_coverage(
    request: Request,
    sub_id: int,
    payer_type: str = Form(...),
    member_id: int | None = Form(None),
    end_date: str = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        end_date_parsed = date.fromisoformat(end_date)
        if payer_type == "SELF":
            member_id = None

        # Auto-compute start_date: day after the latest existing coverage end
        q = db.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.subscription_id == sub_id,
            SubscriptionCoverageModel.payer_type == payer_type,
        )
        if payer_type == "MEMBER":
            q = q.filter(SubscriptionCoverageModel.member_id == member_id)
        else:
            q = q.filter(SubscriptionCoverageModel.member_id.is_(None))

        existing = q.all()
        if existing:
            max_end = max(c.end_date for c in existing)
            start_date_parsed = max_end + timedelta(days=1)
        else:
            start_date_parsed = end_date_parsed

        CreateInitialCoverageUseCase(db).execute(
            account_id=user_id,
            subscription_id=sub_id,
            payer_type=payer_type,
            member_id=member_id,
            start_date=start_date_parsed,
            end_date=end_date_parsed,
        )
    except (SubscriptionValidationError, ValueError) as e:
        return RedirectResponse(
            f"/subscriptions/{sub_id}?error={str(e)}",
            status_code=302,
        )

    return RedirectResponse(f"/subscriptions/{sub_id}", status_code=302)


@router.get("/subscriptions/{sub_id}/edit", response_class=HTMLResponse)
def subscription_edit_page(
    request: Request,
    sub_id: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id,
        SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        return RedirectResponse("/subscriptions", status_code=302)

    cats = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
    ).all()
    expense_cats = [c for c in cats if c.category_type == "EXPENSE"]
    income_cats = [c for c in cats if c.category_type == "INCOME"]

    members = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.subscription_id == sub_id,
    ).all()
    # Build contact_map for member names
    contact_ids = list({m.contact_id for m in members})
    contact_map = {}
    if contact_ids:
        contacts = db.query(ContactModel).filter(ContactModel.id.in_(contact_ids)).all()
        contact_map = {c.id: c for c in contacts}
    members.sort(key=lambda m: (contact_map.get(m.contact_id) and contact_map[m.contact_id].name or "").lower())

    # All contacts for the "add member" dropdown
    all_contacts = db.query(ContactModel).filter(
        ContactModel.account_id == user_id,
        ContactModel.is_archived == False,
    ).order_by(ContactModel.name).all()

    return templates.TemplateResponse("subscription_form.html", {
        "request": request,
        "mode": "edit",
        "sub": sub,
        "expense_cats": expense_cats,
        "income_cats": income_cats,
        "members": members,
        "contact_map": contact_map,
        "all_contacts": all_contacts,
        "error": "",
    })


@router.post("/subscriptions/{sub_id}/edit", response_class=HTMLResponse)
def subscription_update(
    request: Request,
    sub_id: int,
    name: str = Form(...),
    expense_category_id: int = Form(...),
    income_category_id: int = Form(...),
    is_archived: str = Form(""),
    notify_enabled: str = Form(""),
    notify_days_before: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id,
        SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        return RedirectResponse("/subscriptions", status_code=302)

    want_archived = is_archived == "on"

    try:
        # Unarchive first if needed
        if sub.is_archived and not want_archived:
            UnarchiveSubscriptionUseCase(db).execute(sub_id, user_id)
            sub = db.query(SubscriptionModel).filter(SubscriptionModel.id == sub_id).first()

        # Update fields
        UpdateSubscriptionUseCase(db).execute(
            sub_id, user_id,
            name=name,
            expense_category_id=expense_category_id,
            income_category_id=income_category_id,
        )

        # Update notification settings
        sub = db.query(SubscriptionModel).filter(SubscriptionModel.id == sub_id).first()
        sub.notify_enabled = notify_enabled == "on"
        sub.notify_days_before = int(notify_days_before) if notify_days_before.strip() else None
        db.commit()

        # Archive last if needed
        sub = db.query(SubscriptionModel).filter(SubscriptionModel.id == sub_id).first()
        if not sub.is_archived and want_archived:
            ArchiveSubscriptionUseCase(db).execute(sub_id, user_id)

        view = "archived" if want_archived else "active"
        return RedirectResponse(f"/subscriptions?view={view}", status_code=302)
    except SubscriptionValidationError as e:
        db.rollback()
        cats = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id,
            CategoryInfo.is_archived == False,
        ).all()
        members = db.query(SubscriptionMemberModel).filter(
            SubscriptionMemberModel.subscription_id == sub_id,
        ).all()
        c_ids = list({m.contact_id for m in members})
        c_map = {}
        if c_ids:
            c_map = {c.id: c for c in db.query(ContactModel).filter(ContactModel.id.in_(c_ids)).all()}
        members.sort(key=lambda m: (c_map.get(m.contact_id) and c_map[m.contact_id].name or "").lower())
        all_contacts = db.query(ContactModel).filter(
            ContactModel.account_id == user_id, ContactModel.is_archived == False,
        ).order_by(ContactModel.name).all()
        return templates.TemplateResponse("subscription_form.html", {
            "request": request,
            "mode": "edit",
            "sub": sub,
            "expense_cats": [c for c in cats if c.category_type == "EXPENSE"],
            "income_cats": [c for c in cats if c.category_type == "INCOME"],
            "members": members,
            "contact_map": c_map,
            "all_contacts": all_contacts,
            "error": str(e),
        })


@router.post("/subscriptions/{sub_id}/members", response_class=HTMLResponse)
def subscription_add_member(
    request: Request,
    sub_id: int,
    contact_id: int = Form(...),
    payment_per_year: str = Form(""),
    payment_per_month: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    ppy = Decimal(payment_per_year) if payment_per_year.strip() else None
    ppm = Decimal(payment_per_month) if payment_per_month.strip() else None

    try:
        AddSubscriptionMemberUseCase(db).execute(
            account_id=user_id,
            subscription_id=sub_id,
            contact_id=contact_id,
            payment_per_year=ppy,
            payment_per_month=ppm,
        )
    except SubscriptionValidationError:
        db.rollback()
    return RedirectResponse(f"/subscriptions/{sub_id}/edit", status_code=302)


@router.post("/subscriptions/{sub_id}/members/{mid}/archive", response_class=HTMLResponse)
def subscription_archive_member(
    request: Request,
    sub_id: int,
    mid: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        ArchiveMemberUseCase(db).execute(mid, user_id)
    except SubscriptionValidationError:
        db.rollback()
    return RedirectResponse(f"/subscriptions/{sub_id}/edit", status_code=302)


@router.post("/subscriptions/{sub_id}/members/{mid}/unarchive", response_class=HTMLResponse)
def subscription_unarchive_member(
    request: Request,
    sub_id: int,
    mid: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        UnarchiveMemberUseCase(db).execute(mid, user_id)
    except SubscriptionValidationError:
        db.rollback()
    return RedirectResponse(f"/subscriptions/{sub_id}/edit", status_code=302)


@router.post("/subscriptions/{sub_id}/members/{mid}/payment", response_class=HTMLResponse)
def subscription_update_member_payment(
    request: Request,
    sub_id: int,
    mid: int,
    payment_per_year: str = Form(""),
    payment_per_month: str = Form(""),
    next: str = Form("edit"),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    ppy = Decimal(payment_per_year) if payment_per_year.strip() else None
    ppm = Decimal(payment_per_month) if payment_per_month.strip() else None

    try:
        UpdateMemberPaymentUseCase(db).execute(mid, user_id, ppy, ppm)
    except SubscriptionValidationError:
        db.rollback()

    if next == "detail":
        return RedirectResponse(f"/subscriptions/{sub_id}", status_code=302)
    return RedirectResponse(f"/subscriptions/{sub_id}/edit", status_code=302)


@router.post("/subscriptions/{sub_id}/extend")
async def extend_subscription(
    request: Request,
    sub_id: int,
    db: Session = Depends(get_db),
):
    """Продлить подписку: создать EXPENSE + обновить paid_until"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        form = await request.form()
        wallet_id = int(form["wallet_id"])
        amount_decimal = Decimal(str(form["amount"]))
        paid_until_date = date.fromisoformat(str(form["new_paid_until"]))

        # Collect member_ids from checkboxes
        member_ids = [int(v) for v in form.getlist("member_ids")]

        result = ExtendSubscriptionUseCase(db).execute(
            account_id=user_id,
            subscription_id=sub_id,
            wallet_id=wallet_id,
            amount=amount_decimal,
            new_paid_until=paid_until_date,
            member_ids=member_ids,
            actor_user_id=user_id,
        )
        success_msg = quote(f"Подписка продлена до {paid_until_date.strftime('%d.%m.%Y')}")
        return RedirectResponse(
            f"/subscriptions/{sub_id}?success={success_msg}",
            status_code=302,
        )
    except (SubscriptionValidationError, ValueError, Exception) as e:
        db.rollback()
        return RedirectResponse(
            f"/subscriptions/{sub_id}?error={quote(str(e))}",
            status_code=302,
        )


@router.post("/subscriptions/{sub_id}/compensate")
def compensate_subscription(
    request: Request,
    sub_id: int,
    wallet_id: int = Form(...),
    amount: str = Form(...),
    member_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Получить компенсацию от участника: создать INCOME"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        amount_decimal = Decimal(amount)

        result = CompensateSubscriptionUseCase(db).execute(
            account_id=user_id,
            subscription_id=sub_id,
            wallet_id=wallet_id,
            amount=amount_decimal,
            member_id=member_id,
            actor_user_id=user_id,
        )
        success_msg = quote(f"Компенсация {amount} добавлена")
        return RedirectResponse(
            f"/subscriptions/{sub_id}?success={success_msg}",
            status_code=302,
        )
    except (SubscriptionValidationError, ValueError, Exception) as e:
        db.rollback()
        return RedirectResponse(
            f"/subscriptions/{sub_id}?error={quote(str(e))}",
            status_code=302,
        )


@router.get("/subscriptions/{sub_id}/analytics")
def subscription_analytics_api(
    request: Request,
    sub_id: int,
    db: Session = Depends(get_db),
):
    """JSON endpoint: subscription financial analytics + timeline for Chart.js."""
    if not require_user(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    user_id = request.session["user_id"]

    sub = db.query(SubscriptionModel).filter(
        SubscriptionModel.id == sub_id,
        SubscriptionModel.account_id == user_id,
    ).first()
    if not sub:
        return JSONResponse({"error": "not found"}, status_code=404)

    analytics = compute_subscription_analytics(db, sub)

    return JSONResponse({
        "total_expense": float(analytics["total_expense"]),
        "total_income": float(analytics["total_income"]),
        "net_cost": float(analytics["net_cost"]),
        "member_count": analytics["member_count"],
        "expected_share": float(analytics["expected_share"]),
        "friends": [
            {
                "contact_name": f["contact_name"],
                "paid": float(f["paid"]),
                "expected": float(f["expected"]),
                "debt": float(f["debt"]),
            }
            for f in analytics["friends"]
        ],
        "timeline": analytics["timeline"],
    })


# === Contacts ===


@router.get("/contacts", response_class=HTMLResponse)
def contacts_list(
    request: Request,
    view: str = "active",
    q: str = "",
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    query = db.query(ContactModel).filter(ContactModel.account_id == user_id)
    if view == "archived":
        query = query.filter(ContactModel.is_archived == True)
    else:
        query = query.filter(ContactModel.is_archived == False)

    if q:
        query = query.filter(ContactModel.name.ilike(f"%{q}%"))

    contacts = query.order_by(ContactModel.name).all()

    return templates.TemplateResponse("contacts_list.html", {
        "request": request,
        "contacts": contacts,
        "view": view,
        "q": q,
    })


@router.get("/contacts/new", response_class=HTMLResponse)
def contact_new_page(request: Request):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    return templates.TemplateResponse("contact_form.html", {
        "request": request,
        "mode": "new",
        "contact": None,
        "error": "",
    })


@router.post("/contacts/new", response_class=HTMLResponse)
def contact_create(
    request: Request,
    name: str = Form(...),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    try:
        cid = CreateContactUseCase(db).execute(
            account_id=user_id, name=name, note=note,
        )
        return RedirectResponse(f"/contacts/{cid}", status_code=302)
    except ContactValidationError as e:
        db.rollback()
        return templates.TemplateResponse("contact_form.html", {
            "request": request,
            "mode": "new",
            "contact": None,
            "error": str(e),
        })


@router.get("/contacts/{contact_id}", response_class=HTMLResponse)
def contact_detail_page(
    request: Request,
    contact_id: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    contact = db.query(ContactModel).filter(
        ContactModel.id == contact_id,
        ContactModel.account_id == user_id,
    ).first()
    if not contact:
        return RedirectResponse("/contacts", status_code=302)

    # Find all subscription memberships for this contact
    links = db.query(SubscriptionMemberModel).filter(
        SubscriptionMemberModel.contact_id == contact_id,
        SubscriptionMemberModel.account_id == user_id,
    ).all()

    sub_ids = [lnk.subscription_id for lnk in links]
    subs_map = {}
    if sub_ids:
        subs = db.query(SubscriptionModel).filter(SubscriptionModel.id.in_(sub_ids)).all()
        subs_map = {s.id: s for s in subs}

    # For each link, compute paid_until from coverages
    subscriptions_info = []
    for lnk in links:
        sub = subs_map.get(lnk.subscription_id)
        if not sub:
            continue

        coverages = db.query(SubscriptionCoverageModel).filter(
            SubscriptionCoverageModel.subscription_id == lnk.subscription_id,
            SubscriptionCoverageModel.payer_type == "MEMBER",
            SubscriptionCoverageModel.member_id == lnk.id,
        ).all()

        paid_until = None
        for cov in coverages:
            if paid_until is None or cov.end_date > paid_until:
                paid_until = cov.end_date

        subscriptions_info.append({
            "subscription": sub,
            "member_link": lnk,
            "paid_until": paid_until,
        })

    return templates.TemplateResponse("contact_detail.html", {
        "request": request,
        "contact": contact,
        "subscriptions_info": subscriptions_info,
    })


@router.get("/contacts/{contact_id}/edit", response_class=HTMLResponse)
def contact_edit_page(
    request: Request,
    contact_id: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    contact = db.query(ContactModel).filter(
        ContactModel.id == contact_id,
        ContactModel.account_id == user_id,
    ).first()
    if not contact:
        return RedirectResponse("/contacts", status_code=302)

    return templates.TemplateResponse("contact_form.html", {
        "request": request,
        "mode": "edit",
        "contact": contact,
        "error": "",
    })


@router.post("/contacts/{contact_id}/edit", response_class=HTMLResponse)
def contact_update(
    request: Request,
    contact_id: int,
    name: str = Form(...),
    note: str = Form(""),
    is_archived: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    contact = db.query(ContactModel).filter(
        ContactModel.id == contact_id,
        ContactModel.account_id == user_id,
    ).first()
    if not contact:
        return RedirectResponse("/contacts", status_code=302)

    want_archived = is_archived == "on"

    try:
        if contact.is_archived and not want_archived:
            UnarchiveContactUseCase(db).execute(contact_id, user_id)

        UpdateContactUseCase(db).execute(
            contact_id, user_id, name=name, note=note,
        )

        contact = db.query(ContactModel).filter(ContactModel.id == contact_id).first()
        if not contact.is_archived and want_archived:
            ArchiveContactUseCase(db).execute(contact_id, user_id)

        view = "archived" if want_archived else "active"
        return RedirectResponse(f"/contacts?view={view}", status_code=302)
    except ContactValidationError as e:
        db.rollback()
        return templates.TemplateResponse("contact_form.html", {
            "request": request,
            "mode": "edit",
            "contact": contact,
            "error": str(e),
        })


# === Events ===

FREQ_LABELS = {"YEARLY": "ежегодно", "MONTHLY": "ежемесячно", "WEEKLY": "еженедельно", "INTERVAL_DAYS": "каждые N дней", "DAILY": "ежедневно"}


@router.get("/events", response_class=HTMLResponse)
def events_list(
    request: Request,
    view: str = "active",
    q: str = "",
    category_id: str = "",
    event_type: str = "",
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    query = db.query(CalendarEventModel).filter(CalendarEventModel.account_id == user_id)

    if view == "archived":
        query = query.filter(CalendarEventModel.is_active == False)
    else:
        query = query.filter(CalendarEventModel.is_active == True)

    if q.strip():
        query = query.filter(CalendarEventModel.title.ilike(f"%{q.strip()}%"))

    if category_id:
        try:
            query = query.filter(CalendarEventModel.category_id == int(category_id))
        except ValueError:
            pass

    if event_type == "single":
        query = query.filter(CalendarEventModel.repeat_rule_id == None)
    elif event_type == "recurring":
        query = query.filter(CalendarEventModel.repeat_rule_id != None)

    events = query.order_by(CalendarEventModel.title).all()

    # Categories for filter + display
    categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
    ).order_by(WorkCategory.title).all()
    wc_map = {wc.category_id: wc for wc in categories}

    # Recurrence rules for display
    rule_ids = {ev.repeat_rule_id for ev in events if ev.repeat_rule_id}
    rule_map = {}
    if rule_ids:
        for r in db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all():
            rule_map[r.rule_id] = r

    # --- Next occurrence date for each event ---
    today = date.today()
    event_ids = [ev.event_id for ev in events]
    next_occ_map: dict[int, date] = {}  # event_id -> next_occurrence_date
    if event_ids:
        from sqlalchemy import func as sa_func
        rows = (
            db.query(
                EventOccurrenceModel.event_id,
                sa_func.min(EventOccurrenceModel.start_date).label("next_date"),
            )
            .filter(
                EventOccurrenceModel.account_id == user_id,
                EventOccurrenceModel.event_id.in_(event_ids),
                EventOccurrenceModel.start_date >= today,
                EventOccurrenceModel.is_cancelled == False,
            )
            .group_by(EventOccurrenceModel.event_id)
            .all()
        )
        for row in rows:
            next_occ_map[row.event_id] = row.next_date

    # --- Upcoming events (active view only, next 30 days, limit 8) ---
    upcoming = []
    upcoming_has_more = False
    if view != "archived":
        deadline = today + timedelta(days=30)
        upcoming_raw = []
        for ev in events:
            nd = next_occ_map.get(ev.event_id)
            if nd and nd <= deadline:
                dl = (nd - today).days
                upcoming_raw.append({
                    "event": ev,
                    "next_date": nd,
                    "days_left": dl,
                })
        upcoming_raw.sort(key=lambda x: x["next_date"])
        upcoming = upcoming_raw[:8]
        upcoming_has_more = len(upcoming_raw) > 8

    # --- Group events by category ---
    cat_groups: dict[int | None, list] = {}
    for ev in events:
        nd = next_occ_map.get(ev.event_id)
        dl = (nd - today).days if nd else None
        item = {"event": ev, "next_date": nd, "days_left": dl}
        cat_groups.setdefault(ev.category_id, []).append(item)

    # Sort items inside each group by next_date ASC (nulls last)
    for grp_items in cat_groups.values():
        grp_items.sort(key=lambda x: x["next_date"] if x["next_date"] else date.max)

    # Build ordered list: categories alphabetically, "Без категории" last
    grouped_list = []
    no_cat_items = cat_groups.pop(None, None)
    sorted_cat_ids = sorted(
        cat_groups.keys(),
        key=lambda cid: (wc_map[cid].title.lower() if cid in wc_map else ""),
    )
    for cid in sorted_cat_ids:
        wc = wc_map.get(cid)
        cat_name = f"{wc.emoji} {wc.title}" if wc and wc.emoji else (wc.title if wc else f"Категория #{cid}")
        grouped_list.append({
            "category_id": cid,
            "category_name": cat_name,
            "events": cat_groups[cid],
            "count": len(cat_groups[cid]),
        })
    if no_cat_items:
        grouped_list.append({
            "category_id": None,
            "category_name": "Без категории",
            "events": no_cat_items,
            "count": len(no_cat_items),
        })

    return templates.TemplateResponse("events_list.html", {
        "request": request,
        "events": events,
        "categories": categories,
        "wc_map": wc_map,
        "rule_map": rule_map,
        "freq_labels": FREQ_LABELS,
        "view": view,
        "q": q,
        "category_id": category_id,
        "event_type": event_type,
        "upcoming": upcoming,
        "upcoming_has_more": upcoming_has_more if view != "archived" else False,
        "grouped_list": grouped_list,
        "next_occ_map": next_occ_map,
        "today": today,
    })


@router.get("/events/new", response_class=HTMLResponse)
def event_new_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
    ).order_by(WorkCategory.title).all()

    return templates.TemplateResponse("event_form.html", {
        "request": request,
        "mode": "new",
        "categories": categories,
    })


@router.post("/events/new", response_class=HTMLResponse)
def event_create(
    request: Request,
    title: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(""),
    event_type: str = Form("onetime"),
    start_date: str = Form(""),
    start_time: str = Form(""),
    end_date: str = Form(""),
    end_time: str = Form(""),
    recurrence_type: str = Form(""),
    rec_month: str = Form(""),
    rec_day: str = Form(""),
    rec_day_yearly: str = Form(""),
    rec_weekdays: list[str] = Form([]),
    rec_interval: int = Form(1),
    rec_start_date: str = Form(""),
    until_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    # Convert string inputs to int for validation
    rec_month_int = int(rec_month) if rec_month else None
    # For yearly events use rec_day_yearly, for monthly use rec_day
    effective_rec_day = rec_day_yearly if recurrence_type == "yearly" else rec_day
    rec_day_int = int(effective_rec_day) if effective_rec_day else None

    error = validate_event_form(
        event_type=event_type,
        title=title,
        recurrence_type=recurrence_type,
        start_date=start_date,
        rec_month=rec_month_int,
        rec_day=rec_day_int,
        rec_weekdays=rec_weekdays or None,
        rec_interval=rec_interval,
        rec_start_date=rec_start_date,
    )
    if error:
        categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("event_form.html", {
            "request": request, "mode": "new", "categories": categories, "error": error,
            "form_title": title, "form_category_id": category_id, "form_description": description,
            "form_event_type": event_type, "form_start_date": start_date, "form_start_time": start_time,
            "form_end_date": end_date, "form_end_time": end_time,
            "form_recurrence_type": recurrence_type, "form_rec_month": rec_month,
            "form_rec_day": rec_day, "form_rec_day_yearly": rec_day_yearly,
            "form_rec_weekdays": rec_weekdays,
            "form_rec_interval": rec_interval, "form_rec_start_date": rec_start_date,
            "form_until_date": until_date,
        })

    try:
        today = date.today()
        if event_type == "onetime":
            CreateEventUseCase(db).execute(
                account_id=user_id,
                title=title,
                category_id=category_id,
                description=description.strip() or None,
                occ_start_date=start_date.strip() or None,
                occ_start_time=start_time.strip() or None,
                occ_end_date=end_date.strip() or None,
                occ_end_time=end_time.strip() or None,
                actor_user_id=user_id,
            )
        else:
            freq, interval, rule_start_date = None, 1, None
            by_weekday, by_monthday, by_month, by_monthday_for_year = None, None, None, None

            if recurrence_type == "yearly":
                freq = "YEARLY"
                by_month = rec_month_int
                by_monthday_for_year = rec_day_int
                rule_start_date = f"{today.year}-{rec_month_int:02d}-{rec_day_int:02d}"
            elif recurrence_type == "monthly":
                freq = "MONTHLY"
                by_monthday = rec_day_int
                rule_start_date = today.isoformat()
            elif recurrence_type == "weekly":
                freq = "WEEKLY"
                by_weekday = ",".join(rec_weekdays)
                rule_start_date = today.isoformat()
            elif recurrence_type == "interval":
                freq = "INTERVAL_DAYS"
                interval = rec_interval
                rule_start_date = rec_start_date.strip()

            CreateEventUseCase(db).execute(
                account_id=user_id, title=title, category_id=category_id,
                description=description.strip() or None,
                freq=freq, interval=interval, start_date=rule_start_date,
                by_weekday=by_weekday, by_monthday=by_monthday,
                by_month=by_month, by_monthday_for_year=by_monthday_for_year,
                until_date=until_date.strip() or None,
                actor_user_id=user_id,
            )
    except Exception as e:
        db.rollback()
        categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("event_form.html", {
            "request": request, "mode": "new", "categories": categories, "error": str(e),
            "form_title": title, "form_category_id": category_id, "form_description": description,
            "form_event_type": event_type, "form_start_date": start_date, "form_start_time": start_time,
            "form_end_date": end_date, "form_end_time": end_time,
            "form_recurrence_type": recurrence_type, "form_rec_month": rec_month,
            "form_rec_day": rec_day, "form_rec_day_yearly": rec_day_yearly,
            "form_rec_weekdays": rec_weekdays,
            "form_rec_interval": rec_interval, "form_rec_start_date": rec_start_date,
            "form_until_date": until_date,
        })
    return RedirectResponse("/events", status_code=302)


@router.get("/events/{event_id}/edit", response_class=HTMLResponse)
def event_edit_page(request: Request, event_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    ev = db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == event_id,
        CalendarEventModel.account_id == user_id,
    ).first()
    if not ev:
        return RedirectResponse("/events", status_code=302)

    categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
    ).order_by(WorkCategory.title).all()

    rule = None
    if ev.repeat_rule_id:
        rule = db.query(RecurrenceRuleModel).filter(
            RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
        ).first()

    # Load occurrence for one-time events
    occurrence = None
    if not ev.repeat_rule_id:
        occurrence = db.query(EventOccurrenceModel).filter(
            EventOccurrenceModel.event_id == event_id,
            EventOccurrenceModel.account_id == user_id,
            EventOccurrenceModel.is_cancelled == False,
        ).first()
        # Debug: print if occurrence found
        if occurrence:
            print(f"DEBUG: Loaded occurrence {occurrence.id} with start_date={occurrence.start_date}")
        else:
            print(f"DEBUG: No occurrence found for event {event_id}")

    return templates.TemplateResponse("event_form.html", {
        "request": request,
        "mode": "edit",
        "event": ev,
        "rule": rule,
        "occurrence": occurrence,
        "categories": categories,
    })


@router.post("/events/{event_id}/edit", response_class=HTMLResponse)
def event_update(
    request: Request,
    event_id: int,
    title: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(""),
    is_archived: str = Form(""),
    event_type: str = Form("onetime"),
    start_date: str = Form(""),
    start_time: str = Form(""),
    end_date: str = Form(""),
    end_time: str = Form(""),
    recurrence_type: str = Form(""),
    rec_month: str = Form(""),
    rec_day: str = Form(""),
    rec_day_yearly: str = Form(""),
    rec_weekdays: list[str] = Form([]),
    rec_interval: int = Form(1),
    rec_start_date: str = Form(""),
    until_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    # Convert string inputs to int for validation
    rec_month_int = int(rec_month) if rec_month else None
    # For yearly events use rec_day_yearly, for monthly use rec_day
    effective_rec_day = rec_day_yearly if recurrence_type == "yearly" else rec_day
    rec_day_int = int(effective_rec_day) if effective_rec_day else None

    ev = db.query(CalendarEventModel).filter(
        CalendarEventModel.event_id == event_id,
        CalendarEventModel.account_id == user_id,
    ).first()
    if not ev:
        return RedirectResponse("/events", status_code=302)

    want_archived = is_archived == "on"

    try:
        # 1. Reactivate first if needed
        if not ev.is_active and not want_archived:
            ReactivateEventUseCase(db).execute(event_id, user_id, actor_user_id=user_id)

        # 2. Update basic fields
        UpdateEventUseCase(db).execute(
            event_id=event_id,
            account_id=user_id,
            title=title.strip(),
            category_id=category_id,
            description=description.strip() or None,
            actor_user_id=user_id,
        )

        # 3. Handle recurrence changes
        today = date.today()
        if event_type == "recurring" and recurrence_type:
            freq, interval, rule_start_date = None, 1, None
            by_weekday, by_monthday, by_month, by_monthday_for_year = None, None, None, None

            if recurrence_type == "yearly":
                freq = "YEARLY"
                by_month = rec_month_int
                by_monthday_for_year = rec_day_int
                rule_start_date = f"{today.year}-{rec_month_int:02d}-{rec_day_int:02d}"
            elif recurrence_type == "monthly":
                freq = "MONTHLY"
                by_monthday = rec_day_int
                rule_start_date = today.isoformat()
            elif recurrence_type == "weekly":
                freq = "WEEKLY"
                by_weekday = ",".join(rec_weekdays) if rec_weekdays else None
                rule_start_date = today.isoformat()
            elif recurrence_type == "interval":
                freq = "INTERVAL_DAYS"
                interval = rec_interval
                rule_start_date = rec_start_date.strip() or today.isoformat()

            if freq:
                # Reload ev after potential reactivate
                ev = db.query(CalendarEventModel).filter(
                    CalendarEventModel.event_id == event_id,
                ).first()
                if ev and ev.repeat_rule_id:
                    UpdateRecurrenceRuleUseCase(db).execute(
                        rule_id=ev.repeat_rule_id, account_id=user_id,
                        freq=freq, interval=interval, start_date=rule_start_date,
                        by_weekday=by_weekday, by_monthday=by_monthday,
                        by_month=by_month, by_monthday_for_year=by_monthday_for_year,
                        until_date=until_date.strip() or None,
                        actor_user_id=user_id,
                    )
                    rebuild_event_occurrences(db, event_id, user_id, today)
                elif ev:
                    new_rule_id = CreateRecurrenceRuleUseCase(db).execute(
                        account_id=user_id, freq=freq, interval=interval,
                        start_date=rule_start_date, by_weekday=by_weekday,
                        by_monthday=by_monthday, by_month=by_month,
                        by_monthday_for_year=by_monthday_for_year,
                        until_date=until_date.strip() or None,
                        actor_user_id=user_id,
                    )
                    UpdateEventUseCase(db).execute(
                        event_id=event_id, account_id=user_id,
                        repeat_rule_id=new_rule_id, actor_user_id=user_id,
                    )
                    OccurrenceGenerator(db).generate_event_occurrences(user_id)
        elif event_type == "onetime" and start_date:
            # If event was recurring, clear the repeat_rule_id
            ev_fresh = db.query(CalendarEventModel).filter(
                CalendarEventModel.event_id == event_id,
            ).first()
            if ev_fresh and ev_fresh.repeat_rule_id:
                UpdateEventUseCase(db).execute(
                    event_id=event_id, account_id=user_id,
                    repeat_rule_id=None, actor_user_id=user_id,
                )
            # Update or create occurrence for one-time events
            occ = db.query(EventOccurrenceModel).filter(
                EventOccurrenceModel.event_id == event_id,
                EventOccurrenceModel.is_cancelled == False,
            ).first()
            if occ:
                print(f"DEBUG: Updating occurrence {occ.id} with start_date={start_date}")
                UpdateEventOccurrenceUseCase(db).execute(
                    occurrence_id=occ.id,
                    account_id=user_id,
                    start_date=start_date.strip() or None,
                    start_time=start_time.strip() or None,
                    end_date=end_date.strip() or None,
                    end_time=end_time.strip() or None,
                    actor_user_id=user_id,
                )
            else:
                # Create new occurrence if it doesn't exist
                print(f"DEBUG: Creating new occurrence for event {event_id} with start_date={start_date}")
                CreateEventOccurrenceUseCase(db).execute(
                    event_id=event_id,
                    account_id=user_id,
                    start_date=start_date.strip(),
                    start_time=start_time.strip() or None,
                    end_date=end_date.strip() or None,
                    end_time=end_time.strip() or None,
                    source="manual",
                    actor_user_id=user_id,
                )

        # 4. Deactivate last if needed
        if ev.is_active and want_archived:
            DeactivateEventUseCase(db).execute(event_id, user_id, actor_user_id=user_id)

        redirect_view = "archived" if want_archived else "active"
        return RedirectResponse(f"/events?view={redirect_view}", status_code=302)
    except (EventValidationError, Exception) as e:
        import traceback
        print(f"EVENT_UPDATE ERROR for event_id={event_id}: {type(e).__name__}: {e}")
        traceback.print_exc()
        db.rollback()
        ev = db.query(CalendarEventModel).filter(
            CalendarEventModel.event_id == event_id,
        ).first()
        categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
        ).order_by(WorkCategory.title).all()
        rule = None
        if ev and ev.repeat_rule_id:
            rule = db.query(RecurrenceRuleModel).filter(
                RecurrenceRuleModel.rule_id == ev.repeat_rule_id,
            ).first()
        occurrence = None
        if ev and not ev.repeat_rule_id:
            occurrence = db.query(EventOccurrenceModel).filter(
                EventOccurrenceModel.event_id == event_id,
                EventOccurrenceModel.is_cancelled == False,
            ).first()
        return templates.TemplateResponse("event_form.html", {
            "request": request, "mode": "edit", "event": ev,
            "rule": rule, "occurrence": occurrence,
            "categories": categories, "error": str(e),
            "form_start_date": start_date, "form_start_time": start_time,
            "form_end_date": end_date, "form_end_time": end_time,
        })


# === Budget ===


def _budget_matrix_nav_urls(
    grain: str, range_count: int, year: int, month: int,
    date_param: date | None, cat_qs: str,
):
    """Compute prev/next navigation URLs for matrix budget (shift by 1 period)."""
    dp = date_param or date.today()
    rc = f"&range_count={range_count}"

    if grain == "day":
        prev_d = dp - timedelta(days=1)
        next_d = dp + timedelta(days=1)
        prev_url = f"/budget?grain=day&date={prev_d.isoformat()}{rc}"
        next_url = f"/budget?grain=day&date={next_d.isoformat()}{rc}"
    elif grain == "week":
        prev_d = dp - timedelta(days=7)
        next_d = dp + timedelta(days=7)
        prev_url = f"/budget?grain=week&date={prev_d.isoformat()}{rc}"
        next_url = f"/budget?grain=week&date={next_d.isoformat()}{rc}"
    elif grain == "year":
        prev_url = f"/budget?grain=year&year={year - 1}{rc}"
        next_url = f"/budget?grain=year&year={year + 1}{rc}"
    else:  # month
        if month == 1:
            prev_y, prev_m = year - 1, 12
        else:
            prev_y, prev_m = year, month - 1
        if month == 12:
            next_y, next_m = year + 1, 1
        else:
            next_y, next_m = year, month + 1
        prev_url = f"/budget?grain=month&year={prev_y}&month={prev_m}{rc}"
        next_url = f"/budget?grain=month&year={next_y}&month={next_m}{rc}"

    if cat_qs:
        prev_url += cat_qs
        next_url += cat_qs
    return prev_url, next_url


@router.get("/budget", response_class=HTMLResponse)
def budget_page(
    request: Request,
    variant_id: int | None = None,
    grain: str | None = None,
    year: int | None = None,
    month: int | None = None,
    date: str | None = None,
    range_count: int | None = None,
    db: Session = Depends(get_db),
):
    """Budget page — multi-period matrix view."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Load user prefs: URL param → session → DB → hardcoded default
    _user_prefs = db.query(User).filter(User.id == user_id).first()
    if grain is None:
        grain = (request.session.get("budget_grain")
                 or (_user_prefs.budget_grain if _user_prefs else None)
                 or "month")
    if range_count is None:
        rc_raw = request.session.get("budget_range_count")
        if rc_raw is not None:
            range_count = int(rc_raw)
        elif _user_prefs and _user_prefs.budget_range_count:
            range_count = _user_prefs.budget_range_count
        else:
            range_count = 3

    # Variant selection: URL param → session → first non-archived → stub
    resolved_variant_id = variant_id
    if resolved_variant_id is None:
        resolved_variant_id = request.session.get("active_variant_id")

    variant = get_active_variant(db, account_id=user_id, variant_id=resolved_variant_id)

    # If requested variant is archived or belongs to another account, fallback
    if variant is not None and variant.is_archived:
        variant = get_active_variant(db, account_id=user_id, variant_id=None)

    all_variants = get_all_variants(db, account_id=user_id)
    has_orphans = has_orphan_budget_data(db, account_id=user_id)

    if variant is None:
        # No active variants — show stub screen
        request.session.pop("active_variant_id", None)
        return templates.TemplateResponse("budget.html", {
            "request": request,
            "stub": True,
            "all_variants": all_variants,
            "has_orphans": has_orphans,
        })

    # Persist active variant in session
    request.session["active_variant_id"] = variant.id

    base_gran = variant.base_granularity.lower()

    # Enforce granularity restrictions: only base and coarser allowed
    allowed = get_allowed_granularities(variant.base_granularity)
    grain = clamp_granularity(grain, variant.base_granularity)

    max_rc = RANGE_LIMITS.get(grain, 12)
    range_count = max(1, min(range_count, max_rc))

    # Persist validated settings to session and DB
    request.session["budget_grain"] = grain
    request.session["budget_range_count"] = range_count
    if _user_prefs:
        _user_prefs.budget_grain = grain
        _user_prefs.budget_range_count = range_count
        db.commit()

    now = datetime.now()

    # Restore anchor from session if not provided in URL
    if year is None:
        year = request.session.get("budget_anchor_year", now.year)
    if month is None:
        month = request.session.get("budget_anchor_month", now.month)
    if date is None:
        date = request.session.get("budget_anchor_date")

    try:
        year = int(year)
    except (ValueError, TypeError):
        year = now.year
    try:
        month = int(month)
    except (ValueError, TypeError):
        month = now.month
    if month < 1:
        month = 1
    elif month > 12:
        month = 12

    # Parse date param for day/week grains
    from datetime import date as date_cls
    date_param = None
    if date:
        try:
            date_param = date_cls.fromisoformat(date)
        except ValueError:
            date_param = None
    if date_param is None:
        date_param = date_cls.today()

    # Save anchor to session so it persists across navigations
    request.session["budget_anchor_year"] = year
    request.session["budget_anchor_month"] = month
    request.session["budget_anchor_date"] = date_param.isoformat()

    # Ensure system categories
    EnsureSystemCategoriesUseCase(db).execute(account_id=user_id, actor_user_id=user_id)

    # Ensure budget months for month grain
    if grain == "month":
        svc = BudgetMatrixService(db)
        periods = svc._compute_periods(grain, range_count, date_param, year, month)
        for p in periods:
            EnsureBudgetMonthUseCase(db).execute(
                account_id=user_id, year=p["year"], month=p["month"],
                actor_user_id=user_id,
                budget_variant_id=variant.id,
            )

    # Load hidden categories and goals for this variant
    hidden_category_ids = get_hidden_category_ids(db, variant.id)
    hidden_goal_ids = get_hidden_goal_ids(db, variant.id)
    hidden_withdrawal_goal_ids = get_hidden_withdrawal_goal_ids(db, variant.id)

    # Build matrix view
    view = BudgetMatrixService(db).build(
        account_id=user_id,
        grain=grain,
        range_count=range_count,
        anchor_date=date_param if grain in ("day", "week") else None,
        anchor_year=year,
        anchor_month=month,
        base_granularity=variant.base_granularity,
        budget_variant_id=variant.id,
        hidden_category_ids=hidden_category_ids,
        hidden_goal_ids=hidden_goal_ids,
        hidden_withdrawal_goal_ids=hidden_withdrawal_goal_ids,
    )
    # Mark future periods so the template can hide fact columns
    _today = datetime.today().date()
    for _p in view["periods"]:
        _p["is_future"] = _p["range_start"] > _today
        _p["is_past"] = _p["range_end"] <= _today

    # Compute per-period opening balances on REGULAR wallets
    _reg_wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.wallet_type == "REGULAR",
        WalletBalance.is_archived == False,
    ).all()
    _reg_ids = [w.wallet_id for w in _reg_wallets]
    _cur_reg_total = sum((w.balance for w in _reg_wallets), Decimal(0))

    _period_balances: list = [None] * len(view["periods"])
    for _i, _p in enumerate(view["periods"]):
        if _p["is_past"]:
            _rs = _p["range_start"]
            if _reg_ids:
                _q_inc = db.query(func.coalesce(func.sum(TransactionFeed.amount), 0)).filter(
                    TransactionFeed.account_id == user_id,
                    TransactionFeed.operation_type == "INCOME",
                    TransactionFeed.wallet_id.in_(_reg_ids),
                    func.date(TransactionFeed.occurred_at) >= _rs,
                ).scalar()
                _q_exp = db.query(func.coalesce(func.sum(TransactionFeed.amount), 0)).filter(
                    TransactionFeed.account_id == user_id,
                    TransactionFeed.operation_type == "EXPENSE",
                    TransactionFeed.wallet_id.in_(_reg_ids),
                    func.date(TransactionFeed.occurred_at) >= _rs,
                ).scalar()
                _q_tin = db.query(func.coalesce(func.sum(TransactionFeed.amount), 0)).filter(
                    TransactionFeed.account_id == user_id,
                    TransactionFeed.operation_type == "TRANSFER",
                    TransactionFeed.to_wallet_id.in_(_reg_ids),
                    func.date(TransactionFeed.occurred_at) >= _rs,
                ).scalar()
                _q_tout = db.query(func.coalesce(func.sum(TransactionFeed.amount), 0)).filter(
                    TransactionFeed.account_id == user_id,
                    TransactionFeed.operation_type == "TRANSFER",
                    TransactionFeed.from_wallet_id.in_(_reg_ids),
                    func.date(TransactionFeed.occurred_at) >= _rs,
                ).scalar()
                _net = (Decimal(_q_inc or 0) - Decimal(_q_exp or 0)
                        + Decimal(_q_tin or 0) - Decimal(_q_tout or 0))
                _period_balances[_i] = float(_cur_reg_total - _net)
            else:
                _period_balances[_i] = 0.0
        elif not _p["is_future"]:
            # Current period: current actual balance
            _period_balances[_i] = float(_cur_reg_total)

    # Future period projections: cumulative from current balance
    _running = float(_cur_reg_total)
    for _i, _p in enumerate(view["periods"]):
        _ic = view["income_totals"]["cells"][_i]
        _wc = view["withdrawal_totals"]["cells"][_i]
        _ec = view["expense_totals"]["cells"][_i]
        _cc = view["credit_totals"]["cells"][_i]
        _gc = view["goal_totals"]["cells"][_i]
        _ip = float(_ic["plan"] + _wc["plan"])
        _if = float(_ic["fact"] + _wc["fact"])
        _ep = float(_ec["plan"] + _cc["plan"] + _gc["plan"])
        _ef = float(_ec["fact"] + _cc["fact"] + _gc["fact"])
        if _p["is_past"]:
            pass  # Current balance already reflects past transactions
        elif not _p["is_future"]:
            # Current period: add remaining planned net to project end-of-period
            _running += (_ip - _if) - (_ep - _ef)
        else:
            _period_balances[_i] = _running
            _running += _ip - _ep

    # All active non-system categories for the visibility filter UI
    all_filter_cats = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
        CategoryInfo.is_system == False,
    ).order_by(CategoryInfo.sort_order, CategoryInfo.title).all()

    def _tree_sort(cats):
        parents = [c for c in cats if c.parent_id is None]
        children_map = {}
        for c in cats:
            if c.parent_id is not None:
                children_map.setdefault(c.parent_id, []).append(c)
        result = []
        for p in parents:
            result.append(p)
            result.extend(children_map.get(p.category_id, []))
        # orphans
        parent_ids = {p.category_id for p in parents}
        for pid, children in children_map.items():
            if pid not in parent_ids:
                result.extend(children)
        return result

    filter_income_cats = _tree_sort([c for c in all_filter_cats if c.category_type == "INCOME"])
    filter_expense_cats = _tree_sort([c for c in all_filter_cats if c.category_type == "EXPENSE"])

    # All active non-system goals for the visibility filter UI
    filter_goals = db.query(GoalInfo).filter(
        GoalInfo.account_id == user_id,
        GoalInfo.is_archived == False,
        GoalInfo.is_system == False,
    ).order_by(GoalInfo.title).all()

    # Credit repayment system category (for filter panel visibility toggle)
    credit_repay_cat = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_system == True,
        CategoryInfo.title == "Погашение кредитов",
    ).first()

    variant_qs = f"&variant_id={variant.id}"
    rc_qs = f"&range_count={range_count}"

    prev_url, next_url = _budget_matrix_nav_urls(
        grain, range_count, year, month, date_param, variant_qs,
    )

    # Grain selector — only allowed granularities
    all_grain_urls = {
        "day": f"/budget?grain=day&date={date_param.isoformat()}{rc_qs}{variant_qs}",
        "week": f"/budget?grain=week&date={date_param.isoformat()}{rc_qs}{variant_qs}",
        "month": f"/budget?grain=month&year={year}&month={month}{rc_qs}{variant_qs}",
        "year": f"/budget?grain=year&year={year}{rc_qs}{variant_qs}",
    }
    grains = [
        {"value": g, "label": GRANULARITY_LABELS[g], "url": all_grain_urls[g]}
        for g in allowed
    ]

    return templates.TemplateResponse("budget.html", {
        "request": request,
        "stub": False,
        "view": view,
        "variant": variant,
        "all_variants": all_variants,
        "has_orphans": has_orphans,
        "grain": grain,
        "grains": grains,
        "range_count": range_count,
        "max_range": max_rc,
        "prev_url": prev_url,
        "next_url": next_url,
        "anchor_year": year,
        "anchor_month": month,
        "anchor_date": date_param.isoformat() if date_param else "",
        "base_granularity": base_gran,
        "granularity_label": GRANULARITY_LABELS.get(base_gran, base_gran),
        "show_plan": grain == base_gran,
        "filter_income_cats": filter_income_cats,
        "filter_expense_cats": filter_expense_cats,
        "filter_goals": filter_goals,
        "credit_repay_cat": credit_repay_cat,
        "hidden_category_ids": hidden_category_ids,
        "hidden_goal_ids": hidden_goal_ids,
        "hidden_withdrawal_goal_ids": hidden_withdrawal_goal_ids,
        "period_balances": _period_balances,
    })


@router.get("/budget/report", response_class=HTMLResponse)
def budget_report_page(
    request: Request,
    from_year: int | None = None,
    from_month: int | None = None,
    to_year: int | None = None,
    to_month: int | None = None,
    view: str = "total",
    sort: str = "actual",
    over_only: int = 0,
    variant_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Budget analytical report page."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Defaults: last 6 months inclusive
    today = date.today()
    if to_year is None or to_month is None:
        to_year = today.year
        to_month = today.month
    if from_year is None or from_month is None:
        # Go back 5 months from to_year/to_month to get 6 months total
        fm = to_month - 5
        fy = to_year
        while fm < 1:
            fm += 12
            fy -= 1
        from_year = fy
        from_month = fm

    variant = get_active_variant(db, user_id, variant_id)
    all_variants = get_all_variants(db, user_id)

    svc = BudgetReportService(db)
    report = svc.build(
        account_id=user_id,
        year_from=from_year,
        month_from=from_month,
        year_to=to_year,
        month_to=to_month,
        budget_variant_id=variant.id if variant else None,
    )

    return templates.TemplateResponse("budget_report.html", {
        "request": request,
        "report": report,
        "view": view,
        "sort": sort,
        "over_only": over_only,
        "variant": variant,
        "all_variants": all_variants,
        "from_year": from_year,
        "from_month": from_month,
        "to_year": to_year,
        "to_month": to_month,
    })


@router.get("/budget/variants/new", response_class=HTMLResponse)
def budget_variant_form(request: Request, db: Session = Depends(get_db)):
    """Form to create a new budget variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    has_orphans = has_orphan_budget_data(db, account_id=user_id)

    return templates.TemplateResponse("budget_variant_form.html", {
        "request": request,
        "has_orphans": has_orphans,
        "error": None,
        "granularity_labels": GRANULARITY_LABELS,
    })


@router.post("/budget/variants/new", response_class=HTMLResponse)
def budget_variant_create(request: Request, db: Session = Depends(get_db)):
    """Create a new budget variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    name = form_data.get("name", "").strip()
    base_granularity = form_data.get("base_granularity", "MONTH").strip().upper()
    attach_orphans = form_data.get("attach_orphans") == "on"

    try:
        variant = CreateBudgetVariantUseCase(db).execute(
            account_id=user_id,
            name=name,
            base_granularity=base_granularity,
        )
        if attach_orphans:
            AttachBudgetDataUseCase(db).execute(
                account_id=user_id,
                variant_id=variant.id,
            )
        db.commit()
        return RedirectResponse(f"/budget?variant_id={variant.id}", status_code=302)
    except BudgetValidationError as e:
        has_orphans = has_orphan_budget_data(db, account_id=user_id)
        return templates.TemplateResponse("budget_variant_form.html", {
            "request": request,
            "has_orphans": has_orphans,
            "error": str(e),
            "granularity_labels": GRANULARITY_LABELS,
        })


@router.post("/budget/variants/{vid}/attach", response_class=HTMLResponse)
def budget_variant_attach(request: Request, vid: int, db: Session = Depends(get_db)):
    """Attach orphan budget_months to a variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    variant = db.query(BudgetVariant).filter(
        BudgetVariant.id == vid,
        BudgetVariant.account_id == user_id,
    ).first()
    if variant:
        AttachBudgetDataUseCase(db).execute(account_id=user_id, variant_id=variant.id)
        db.commit()

    return RedirectResponse(f"/budget?variant_id={vid}", status_code=302)


@router.post("/budget/variants/{vid}/archive", response_class=HTMLResponse)
def budget_variant_archive(request: Request, vid: int, db: Session = Depends(get_db)):
    """Archive a budget variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        ArchiveBudgetVariantUseCase(db).execute(account_id=user_id, variant_id=vid)
        db.commit()
        # Clear session variant so it falls back to another active one
        request.session.pop("active_variant_id", None)
    except BudgetValidationError:
        pass

    return RedirectResponse("/budget", status_code=302)


@router.post("/budget/save", response_class=HTMLResponse)
def save_budget_form(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save budget plan (batch form submission)."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio

    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    year = int(form_data.get("year", datetime.now().year))
    month = int(form_data.get("month", datetime.now().month))

    # Resolve variant — from form or session
    vid_str = form_data.get("variant_id", "")
    vid = int(vid_str) if vid_str.strip() else request.session.get("active_variant_id")
    variant = get_active_variant(db, account_id=user_id, variant_id=vid) if vid else None

    # Collect lines from form: category_id[], kind[], plan_amount[]
    category_ids = form_data.getlist("category_id")
    kinds = form_data.getlist("kind")
    plan_amounts = form_data.getlist("plan_amount")

    lines = []
    for i in range(len(category_ids)):
        try:
            cat_id = int(category_ids[i])
            kind = kinds[i] if i < len(kinds) else "EXPENSE"
            amount = plan_amounts[i] if i < len(plan_amounts) else "0"
            amount = amount.strip().replace(",", ".") if amount else "0"
            if not amount:
                amount = "0"
            lines.append({
                "category_id": cat_id,
                "kind": kind,
                "plan_amount": amount,
            })
        except (ValueError, IndexError):
            continue

    try:
        SaveBudgetPlanUseCase(db).execute(
            account_id=user_id,
            year=year,
            month=month,
            lines=lines,
            actor_user_id=user_id,
            budget_variant_id=variant.id if variant else None,
        )
    except Exception:
        db.rollback()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.post("/budget/goals/save", response_class=HTMLResponse)
def save_goal_plans_form(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save goal savings plan (batch form submission)."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    year = int(form_data.get("year", datetime.now().year))
    month = int(form_data.get("month", datetime.now().month))

    # Resolve variant — from form or session
    vid_str = form_data.get("variant_id", "")
    vid = int(vid_str) if vid_str.strip() else request.session.get("active_variant_id")
    variant = get_active_variant(db, account_id=user_id, variant_id=vid) if vid else None

    goal_ids = form_data.getlist("goal_id")
    plan_amounts = form_data.getlist("goal_plan_amount")

    goal_plans = []
    for i in range(len(goal_ids)):
        try:
            goal_id = int(goal_ids[i])
            amount = plan_amounts[i] if i < len(plan_amounts) else "0"
            amount = amount.strip().replace(",", ".") if amount else "0"
            if not amount:
                amount = "0"
            goal_plans.append({"goal_id": goal_id, "plan_amount": amount})
        except (ValueError, IndexError):
            continue

    try:
        SaveGoalPlansUseCase(db).execute(
            account_id=user_id,
            year=year,
            month=month,
            goal_plans=goal_plans,
            actor_user_id=user_id,
            budget_variant_id=variant.id if variant else None,
        )
    except Exception:
        db.rollback()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.get("/budget/goals/plan/edit", response_class=HTMLResponse)
def budget_goal_plan_edit_page(
    request: Request,
    goal_id: int,
    year: int,
    month: int,
    variant_id: int,
    db: Session = Depends(get_db),
):
    """Per-cell goal plan editing page."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)
    if not variant:
        return RedirectResponse("/budget", status_code=302)

    goal = db.query(GoalInfo).filter(
        GoalInfo.goal_id == goal_id,
        GoalInfo.account_id == user_id,
    ).first()
    if not goal:
        return RedirectResponse("/budget", status_code=302)

    # Ensure budget month exists
    bm_id = EnsureBudgetMonthUseCase(db).execute(
        account_id=user_id, year=year, month=month,
        actor_user_id=user_id, budget_variant_id=variant.id,
    )

    # Load existing goal plan
    gp = db.query(BudgetGoalPlan).filter(
        BudgetGoalPlan.budget_month_id == bm_id,
        BudgetGoalPlan.goal_id == goal_id,
    ).first()

    plan_amount = gp.plan_amount if gp else Decimal("0")
    note = gp.note if gp else ""

    period_label = f"{MONTH_NAMES_RU.get(month, str(month))} {year}"
    back_url = f"/budget?year={year}&month={month}&variant_id={variant.id}"

    return templates.TemplateResponse("budget_goal_plan_edit.html", {
        "request": request,
        "goal": goal,
        "year": year,
        "month": month,
        "variant_id": variant.id,
        "period_label": period_label,
        "plan_amount": plan_amount,
        "note": note or "",
        "back_url": back_url,
        "month_label": MONTH_NAMES_RU.get(month, str(month)),
    })


@router.post("/budget/goals/plan/save-single", response_class=HTMLResponse)
def save_goal_plan_single(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save a single goal plan (amount + note) with optional copy forward."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    goal_id = int(form_data.get("goal_id", 0))
    year = int(form_data.get("year", datetime.now().year))
    month = int(form_data.get("month", datetime.now().month))
    variant_id = int(form_data.get("variant_id", 0))
    plan_amount = form_data.get("plan_amount", "0").strip().replace(",", ".") or "0"
    note = form_data.get("note", "").strip() or None
    copy_forward = form_data.get("copy_forward") == "1"

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)

    goal_plans = [{"goal_id": goal_id, "plan_amount": plan_amount, "note": note}]

    months_to_save = [month]
    if copy_forward:
        months_to_save.extend(range(month + 1, 13))

    try:
        for m in months_to_save:
            SaveGoalPlansUseCase(db).execute(
                account_id=user_id,
                year=year,
                month=m,
                goal_plans=goal_plans,
                actor_user_id=user_id,
                budget_variant_id=variant.id if variant else None,
            )
    except Exception:
        db.rollback()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.get("/budget/goals/withdrawal/plan/edit", response_class=HTMLResponse)
def budget_goal_withdrawal_plan_edit_page(
    request: Request,
    goal_id: int,
    year: int,
    month: int,
    variant_id: int,
    db: Session = Depends(get_db),
):
    """Per-cell withdrawal plan editing page ('Взять из отложенного')."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)
    if not variant:
        return RedirectResponse("/budget", status_code=302)

    goal = db.query(GoalInfo).filter(
        GoalInfo.goal_id == goal_id,
        GoalInfo.account_id == user_id,
    ).first()
    if not goal:
        return RedirectResponse("/budget", status_code=302)

    bm_id = EnsureBudgetMonthUseCase(db).execute(
        account_id=user_id, year=year, month=month,
        actor_user_id=user_id, budget_variant_id=variant.id,
    )

    gp = db.query(BudgetGoalWithdrawalPlan).filter(
        BudgetGoalWithdrawalPlan.budget_month_id == bm_id,
        BudgetGoalWithdrawalPlan.goal_id == goal_id,
    ).first()

    plan_amount = gp.plan_amount if gp else Decimal("0")
    note = gp.note if gp else ""

    period_label = f"{MONTH_NAMES_RU.get(month, str(month))} {year}"
    back_url = f"/budget?year={year}&month={month}&variant_id={variant.id}"

    return templates.TemplateResponse("budget_goal_withdrawal_plan_edit.html", {
        "request": request,
        "goal": goal,
        "year": year,
        "month": month,
        "variant_id": variant.id,
        "period_label": period_label,
        "plan_amount": plan_amount,
        "note": note or "",
        "back_url": back_url,
        "month_label": MONTH_NAMES_RU.get(month, str(month)),
    })


@router.post("/budget/goals/withdrawal/plan/save-single", response_class=HTMLResponse)
def save_goal_withdrawal_plan_single(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save a single goal withdrawal plan (amount + note) with optional copy forward."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    goal_id = int(form_data.get("goal_id", 0))
    year = int(form_data.get("year", datetime.now().year))
    month = int(form_data.get("month", datetime.now().month))
    variant_id = int(form_data.get("variant_id", 0))
    plan_amount = form_data.get("plan_amount", "0").strip().replace(",", ".") or "0"
    note = form_data.get("note", "").strip() or None
    copy_forward = form_data.get("copy_forward") == "1"

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)

    goal_plans = [{"goal_id": goal_id, "plan_amount": plan_amount, "note": note}]

    months_to_save = [month]
    if copy_forward:
        months_to_save.extend(range(month + 1, 13))

    try:
        for m in months_to_save:
            SaveGoalWithdrawalPlansUseCase(db).execute(
                account_id=user_id,
                year=year,
                month=m,
                goal_plans=goal_plans,
                actor_user_id=user_id,
                budget_variant_id=variant.id if variant else None,
            )
    except Exception:
        db.rollback()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.post("/budget/visibility/save")
def save_category_visibility(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save category visibility settings for a budget variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    vid_str = form_data.get("variant_id", "")
    vid = int(vid_str) if vid_str.strip() else request.session.get("active_variant_id")
    variant = get_active_variant(db, account_id=user_id, variant_id=vid) if vid else None

    if not variant:
        return RedirectResponse("/budget", status_code=302)

    # Collect visible category IDs from checkboxes
    visible_ids = set()
    for v in form_data.getlist("visible_category_id"):
        try:
            visible_ids.add(int(v))
        except (ValueError, TypeError):
            continue

    # All active non-system category IDs → hidden = all - visible
    all_active = db.query(CategoryInfo.category_id).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
        CategoryInfo.is_system == False,
    ).all()
    all_active_ids = {r.category_id for r in all_active}

    # Also include credit repayment system category (hideable)
    credit_cat = db.query(CategoryInfo.category_id).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_system == True,
        CategoryInfo.title == "Погашение кредитов",
    ).scalar()
    if credit_cat:
        all_active_ids.add(credit_cat)

    hidden_ids = all_active_ids - visible_ids

    save_hidden_category_ids(db, variant.id, hidden_ids)

    # Collect visible goal IDs from checkboxes
    visible_goal_ids = set()
    for v in form_data.getlist("visible_goal_id"):
        try:
            visible_goal_ids.add(int(v))
        except (ValueError, TypeError):
            continue

    all_active_goals = db.query(GoalInfo.goal_id).filter(
        GoalInfo.account_id == user_id,
        GoalInfo.is_archived == False,
        GoalInfo.is_system == False,
    ).all()
    all_active_goal_ids = {r.goal_id for r in all_active_goals}
    hidden_goal_ids = all_active_goal_ids - visible_goal_ids

    save_hidden_goal_ids(db, variant.id, hidden_goal_ids)

    # Collect visible withdrawal goal IDs from checkboxes
    visible_withdrawal_goal_ids = set()
    for v in form_data.getlist("visible_withdrawal_goal_id"):
        try:
            visible_withdrawal_goal_ids.add(int(v))
        except (ValueError, TypeError):
            continue

    hidden_withdrawal_goal_ids = all_active_goal_ids - visible_withdrawal_goal_ids
    save_hidden_withdrawal_goal_ids(db, variant.id, hidden_withdrawal_goal_ids)

    db.commit()

    # Redirect back preserving current view params
    grain = form_data.get("grain", "month")
    year_val = form_data.get("year", "")
    month_val = form_data.get("month", "")
    date_val = form_data.get("date", "")
    range_count = form_data.get("range_count", "3")

    qs = f"variant_id={variant.id}&grain={grain}&range_count={range_count}"
    if grain in ("day", "week") and date_val:
        qs += f"&date={date_val}"
    else:
        if year_val:
            qs += f"&year={year_val}"
        if month_val:
            qs += f"&month={month_val}"

    return RedirectResponse(f"/budget?{qs}", status_code=302)


@router.get("/budget/plan/edit", response_class=HTMLResponse)
def budget_plan_edit_page(
    request: Request,
    category_id: int,
    year: int,
    month: int,
    variant_id: int,
    kind: str = "EXPENSE",
    db: Session = Depends(get_db),
):
    """Per-cell budget plan editing page."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)
    if not variant:
        return RedirectResponse("/budget", status_code=302)

    category = db.query(CategoryInfo).filter(
        CategoryInfo.category_id == category_id,
        CategoryInfo.account_id == user_id,
    ).first()
    if not category:
        return RedirectResponse("/budget", status_code=302)

    # Ensure budget month exists
    bm_id = EnsureBudgetMonthUseCase(db).execute(
        account_id=user_id, year=year, month=month,
        actor_user_id=user_id, budget_variant_id=variant.id,
    )

    # Load existing plan line
    bl = db.query(BudgetLine).filter(
        BudgetLine.budget_month_id == bm_id,
        BudgetLine.category_id == category_id,
        BudgetLine.kind == kind,
    ).first()

    plan_manual = bl.plan_amount if bl else Decimal("0")
    note = bl.note if bl else ""

    # Compute date range for the month
    range_start = date(year, month, 1)
    if month == 12:
        range_end = date(year + 1, 1, 1)
    else:
        range_end = date(year, month + 1, 1)

    # Sum of planned operations for this category + period
    plan_planned = (
        db.query(func.sum(OperationTemplateModel.amount))
        .join(OperationOccurrence, OperationOccurrence.template_id == OperationTemplateModel.template_id)
        .filter(
            OperationTemplateModel.account_id == user_id,
            OperationTemplateModel.category_id == category_id,
            OperationTemplateModel.kind == kind,
            OperationOccurrence.scheduled_date >= range_start,
            OperationOccurrence.scheduled_date < range_end,
            OperationOccurrence.status != "SKIPPED",
        )
        .scalar()
    ) or Decimal("0")

    # Individual planned operations for the table
    planned_ops = (
        db.query(
            OperationTemplateModel.title,
            OperationTemplateModel.amount,
            OperationOccurrence.scheduled_date,
            OperationOccurrence.status,
            RecurrenceRuleModel.freq,
            RecurrenceRuleModel.interval,
        )
        .join(OperationOccurrence, OperationOccurrence.template_id == OperationTemplateModel.template_id)
        .outerjoin(RecurrenceRuleModel, RecurrenceRuleModel.rule_id == OperationTemplateModel.rule_id)
        .filter(
            OperationTemplateModel.account_id == user_id,
            OperationTemplateModel.category_id == category_id,
            OperationTemplateModel.kind == kind,
            OperationOccurrence.scheduled_date >= range_start,
            OperationOccurrence.scheduled_date < range_end,
            OperationOccurrence.status != "SKIPPED",
        )
        .order_by(OperationOccurrence.scheduled_date)
        .all()
    )

    period_label = f"{MONTH_NAMES_RU.get(month, str(month))} {year}"
    back_url = f"/budget?year={year}&month={month}&variant_id={variant.id}"

    return templates.TemplateResponse("budget_plan_edit.html", {
        "request": request,
        "category": category,
        "kind": kind,
        "year": year,
        "month": month,
        "variant_id": variant.id,
        "variant": variant,
        "period_label": period_label,
        "plan_manual": plan_manual,
        "plan_planned": plan_planned,
        "plan_total": plan_manual + plan_planned,
        "note": note or "",
        "planned_ops": planned_ops,
        "back_url": back_url,
        "freq_labels": OP_FREQ_LABELS,
        "month_label": MONTH_NAMES_RU.get(month, str(month)),
    })


@router.post("/budget/plan/save-single", response_class=HTMLResponse)
def save_budget_plan_single(
    request: Request,
    db: Session = Depends(get_db),
):
    """Save a single budget plan line (amount + note)."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    import asyncio
    loop = asyncio.new_event_loop()
    form_data = loop.run_until_complete(request.form())
    loop.close()

    category_id = int(form_data.get("category_id", 0))
    kind = form_data.get("kind", "EXPENSE")
    year = int(form_data.get("year", datetime.now().year))
    month = int(form_data.get("month", datetime.now().month))
    variant_id = int(form_data.get("variant_id", 0))
    plan_amount = form_data.get("plan_amount", "0").strip().replace(",", ".") or "0"
    note = form_data.get("note", "").strip() or None
    copy_forward = form_data.get("copy_forward") == "1"

    variant = get_active_variant(db, account_id=user_id, variant_id=variant_id)

    lines = [{"category_id": category_id, "kind": kind, "plan_amount": plan_amount, "note": note}]

    # Months to save: current month + optionally remaining months of the year
    months_to_save = [month]
    if copy_forward:
        months_to_save.extend(range(month + 1, 13))

    try:
        for m in months_to_save:
            SaveBudgetPlanUseCase(db).execute(
                account_id=user_id,
                year=year,
                month=m,
                lines=lines,
                actor_user_id=user_id,
                budget_variant_id=variant.id if variant else None,
            )
    except Exception:
        db.rollback()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.post("/budget/order/move")
def move_budget_category_order(
    request: Request,
    category_id: int = Form(...),
    kind: str = Form(...),
    direction: str = Form(...),
    year: int = Form(...),
    month: int = Form(...),
    variant_id: int | None = Form(None),
    db: Session = Depends(get_db),
):
    """Move a budget category up or down in the ordering."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Resolve variant
    vid = variant_id or request.session.get("active_variant_id")
    variant = get_active_variant(db, account_id=user_id, variant_id=vid) if vid else None

    q = db.query(BudgetMonth).filter(
        BudgetMonth.account_id == user_id,
        BudgetMonth.year == year,
        BudgetMonth.month == month,
    )
    if variant:
        q = q.filter(BudgetMonth.budget_variant_id == variant.id)
    budget_month = q.first()

    if budget_month:
        swap_budget_position(db, budget_month.id, category_id, kind, direction)
        db.commit()

    qs = f"&variant_id={variant.id}" if variant else ""
    return RedirectResponse(f"/budget?year={year}&month={month}{qs}", status_code=302)


@router.post("/budget/copy-plan")
def copy_budget_plan(
    request: Request,
    year: int = Form(...),
    month: int = Form(...),
    variant_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Copy plan from previous period to current period."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    prev_year, prev_month = get_previous_period(year, month)

    try:
        CopyBudgetPlanUseCase(db).execute(
            account_id=user_id,
            from_year=prev_year,
            from_month=prev_month,
            to_year=year,
            to_month=month,
            budget_variant_id=variant_id,
            actor_user_id=user_id,
        )
    except Exception:
        db.rollback()

    return RedirectResponse(
        f"/budget?year={year}&month={month}&variant_id={variant_id}",
        status_code=302,
    )


@router.post("/budget/template/save")
def save_budget_template(
    request: Request,
    year: int = Form(...),
    month: int = Form(...),
    variant_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Save current period's plan as template for the variant."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        SaveAsTemplateUseCase(db).execute(
            account_id=user_id,
            year=year,
            month=month,
            budget_variant_id=variant_id,
        )
    except Exception:
        db.rollback()

    return RedirectResponse(
        f"/budget?year={year}&month={month}&variant_id={variant_id}",
        status_code=302,
    )


@router.post("/budget/template/apply")
def apply_budget_template(
    request: Request,
    year: int = Form(...),
    month: int = Form(...),
    variant_id: int = Form(...),
    db: Session = Depends(get_db),
):
    """Apply variant's template to the current period."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        ApplyTemplateToPeriodUseCase(db).execute(
            account_id=user_id,
            year=year,
            month=month,
            budget_variant_id=variant_id,
            actor_user_id=user_id,
        )
    except Exception:
        db.rollback()

    return RedirectResponse(
        f"/budget?year={year}&month={month}&variant_id={variant_id}",
        status_code=302,
    )


@router.post("/budget/copy-forward")
def copy_manual_plan_forward(
    request: Request,
    year: int = Form(...),
    month: int = Form(...),
    variant_id: int = Form(...),
    periods_ahead: int = Form(3),
    overwrite: str = Form(""),
    db: Session = Depends(get_db),
):
    """Copy manual plan from current period to N future periods."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        CopyManualPlanForwardUseCase(db).execute(
            account_id=user_id,
            from_year=year,
            from_month=month,
            periods_ahead=max(1, min(periods_ahead, 24)),
            budget_variant_id=variant_id,
            overwrite=overwrite == "on",
            actor_user_id=user_id,
        )
    except Exception:
        db.rollback()

    return RedirectResponse(
        f"/budget?year={year}&month={month}&variant_id={variant_id}",
        status_code=302,
    )


# === Plan (aggregated timeline) ===

@router.get("/plan", response_class=HTMLResponse)
def plan_page(
    request: Request,
    tab: str = "active",
    range: int = 7,
    db: Session = Depends(get_db),
):
    """Plan page — unified calendar timeline."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]
    today = date.today()

    if tab not in ("active", "done", "archive"):
        tab = "active"
    range_days = range if range in (1, 7, 30, 90) else 7

    gen = OccurrenceGenerator(db)
    gen.generate_all(user_id)

    view = build_plan_view(db, user_id, today, tab=tab, range_days=range_days)

    return templates.TemplateResponse("plan.html", {
        "request": request,
        **view,
    })


@router.post("/plan/tasks/{task_id}/complete")
def plan_complete_task(request: Request, task_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        task = db.query(TaskModel).filter(
            TaskModel.task_id == task_id, TaskModel.account_id == user_id
        ).first()
        if not task:
            return RedirectResponse(redirect, status_code=302)

        # Block normal completion if expense is required — redirect to tasks page
        _user = db.query(User).filter(User.id == user_id).first()
        if _user and _user.enable_task_expense_link and task.requires_expense:
            request.session["flash"] = {"message": "Эта задача требует создания расхода", "type": "error"}
            return RedirectResponse("/tasks", status_code=302)

        today_msk = datetime.now(timezone(timedelta(hours=3))).date()
        xp_delta = preview_task_xp(task.due_date if task else None, today_msk)
        CompleteTaskUseCase(db).execute(task_id, user_id, actor_user_id=user_id)
        request.session["flash"] = {"message": f"🎉 +{xp_delta} XP"}
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/tasks/{task_id}/archive")
def plan_archive_task(request: Request, task_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ArchiveTaskUseCase(db).execute(task_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/task-occurrences/{occurrence_id}/complete")
def plan_complete_task_occ(request: Request, occurrence_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CompleteTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
        request.session["flash"] = {"message": "🎉 +10 XP"}
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/task-occurrences/{occurrence_id}/skip")
def plan_skip_task_occ(request: Request, occurrence_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/tasks/{task_id}/uncomplete")
def plan_uncomplete_task(request: Request, task_id: int, redirect: str = Form("/"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        UncompleteTaskUseCase(db).execute(task_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/task-occurrences/{occurrence_id}/uncomplete")
def plan_uncomplete_task_occ(request: Request, occurrence_id: int, redirect: str = Form("/"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        UncompleteTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/habit-occurrences/{occurrence_id}/toggle")
def plan_toggle_habit(request: Request, occurrence_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ToggleHabitOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.get("/plan/operation-occurrences/{occurrence_id}/confirm")
def plan_confirm_operation_form(request: Request, occurrence_id: int, redirect: str = "/plan", db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    occ = db.query(OperationOccurrence).filter(
        OperationOccurrence.id == occurrence_id,
        OperationOccurrence.account_id == user_id,
        OperationOccurrence.status == "ACTIVE",
    ).first()
    if not occ:
        return RedirectResponse(redirect, status_code=302)

    tmpl = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.template_id == occ.template_id,
    ).first()
    if not tmpl:
        return RedirectResponse(redirect, status_code=302)

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False,
    ).all()

    categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id,
        CategoryInfo.is_archived == False,
    ).all()
    categories = [c for c in categories if c.category_type == tmpl.kind]

    kind_labels = {"INCOME": "Доход", "EXPENSE": "Расход"}

    return templates.TemplateResponse("confirm_operation.html", {
        "request": request,
        "occurrence": occ,
        "template": tmpl,
        "wallets": wallets,
        "categories": categories,
        "kind_label": kind_labels.get(tmpl.kind, tmpl.kind),
        "redirect": redirect,
    })


@router.post("/plan/operation-occurrences/{occurrence_id}/confirm")
def plan_confirm_operation(
    request: Request, occurrence_id: int,
    amount: Decimal = Form(...),
    wallet_id: int | None = Form(None),
    category_id: int | None = Form(None),
    description: str = Form(""),
    redirect: str = Form("/plan"),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ConfirmOperationOccurrenceUseCase(db).execute(
            occurrence_id, request.session["user_id"],
            actor_user_id=request.session["user_id"],
            override_amount=amount,
            override_wallet_id=wallet_id,
            override_category_id=category_id,
            override_description=description or None,
        )
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/operation-occurrences/{occurrence_id}/skip")
def plan_skip_operation(request: Request, occurrence_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipOperationOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


@router.post("/plan/event-occurrences/{occurrence_id}/cancel")
def plan_cancel_event(request: Request, occurrence_id: int, redirect: str = Form("/plan"), db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CancelEventOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse(redirect, status_code=302)


# ====================
# WISHES
# ====================

_WISH_MONTH_NAMES_RU = {
    1: "январь", 2: "февраль", 3: "март", 4: "апрель",
    5: "май", 6: "июнь", 7: "июль", 8: "август",
    9: "сентябрь", 10: "октябрь", 11: "ноябрь", 12: "декабрь",
}

_WISH_STATUS_LABELS = {
    "IDEA": "идея",
    "CONSIDERING": "думаю",
    "PLANNED": "запланировано",
    "DONE": "выполнено",
    "CANCELED": "отменено",
}


def _enrich_wish(w, today: date) -> dict:
    """Build display dict for a single wish."""
    # Resolve effective date
    eff_date: date | None = None
    formatted_date: str | None = None
    if w.target_date:
        eff_date = w.target_date
        formatted_date = w.target_date.strftime("%d.%m.%Y")
    elif w.target_month:
        try:
            y, m = w.target_month.split("-")
            eff_date = date(int(y), int(m), 1)
            formatted_date = f"{_WISH_MONTH_NAMES_RU.get(int(m), m)} {y}"
        except (ValueError, KeyError):
            formatted_date = w.target_month

    days_until: int | None = None
    is_overdue = False
    if eff_date:
        days_until = (eff_date - today).days
        is_overdue = days_until < 0

    # Meta parts
    meta_parts: list[str] = []
    label = _WISH_STATUS_LABELS.get(w.status)
    if label:
        meta_parts.append(label)
    if formatted_date:
        meta_parts.append(formatted_date)
    if days_until is not None:
        if days_until == 0:
            meta_parts.append("сегодня")
        elif days_until == 1:
            meta_parts.append("завтра")
        elif days_until > 1:
            meta_parts.append(f"через {days_until} дн.")
        else:
            meta_parts.append("просрочено")
    if w.is_recurring:
        meta_parts.append("повтор")

    return {
        "wish": w,
        "days_until": days_until,
        "is_overdue": is_overdue,
        "formatted_date": formatted_date,
        "meta": " · ".join(meta_parts),
    }


@router.get("/wishes", response_class=HTMLResponse)
def wishes_list(
    request: Request,
    period: str = "all",
    status: str = "active",
    search: str = "",
    db: Session = Depends(get_db)
):
    """Список хотелок"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    # Parse status filter (can be comma-separated)
    statuses = None
    if status == "active":
        # Active = not done and not canceled
        statuses = ["IDEA", "CONSIDERING", "PLANNED"]
    elif status and status != "all":
        statuses = [s.strip() for s in status.split(",")]

    service = WishesService(db)
    wishes = service.get_filtered_wishes(
        account_id=account_id,
        period=period,
        statuses=statuses,
        search=search if search else None
    )

    # Group by type, enrich each item
    today = date.today()
    grouped_raw = service.group_by_type(wishes)
    grouped_wishes: dict[str, list[dict]] = {}
    for wtype, wlist in grouped_raw.items():
        grouped_wishes[wtype] = [_enrich_wish(w, today) for w in wlist]

    # Summary counts (across ALL filtered wishes)
    deadline_30 = today + timedelta(days=30)
    count_active = len(wishes)
    count_next30 = 0
    count_recurring = 0
    for w in wishes:
        if w.is_recurring:
            count_recurring += 1
        if w.target_date and w.target_date <= deadline_30:
            count_next30 += 1
        elif w.target_month:
            try:
                y, m = w.target_month.split("-")
                if date(int(y), int(m), 1) <= deadline_30:
                    count_next30 += 1
            except (ValueError, KeyError):
                pass

    return templates.TemplateResponse("wishes_list.html", {
        "request": request,
        "grouped_wishes": grouped_wishes,
        "period": period,
        "status": status,
        "search": search,
        "count_active": count_active,
        "count_next30": count_next30,
        "count_recurring": count_recurring,
    })


@router.post("/wishes/{wish_id}/to-task")
def wish_to_task(request: Request, wish_id: int, db: Session = Depends(get_db)):
    """Создать задачу из хотелки."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    account_id = request.session["user_id"]
    wish = db.query(WishModel).filter(
        WishModel.wish_id == wish_id,
        WishModel.account_id == account_id,
    ).first()
    if not wish:
        return RedirectResponse("/wishes", status_code=302)
    CreateTaskUseCase(db).execute(
        account_id=account_id,
        title=wish.title,
        actor_user_id=account_id,
    )
    return RedirectResponse("/tasks", status_code=302)


@router.get("/wishes/purchase", response_class=HTMLResponse)
def wishes_purchase(request: Request, db: Session = Depends(get_db)):
    """Режим Закупка - массовое выполнение хотелок типа PURCHASE"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    service = WishesService(db)
    wishes = service.get_purchase_wishes(account_id)

    return templates.TemplateResponse("wishes_purchase.html", {
        "request": request,
        "wishes": wishes,
    })


@router.post("/wishes/purchase/complete", response_class=HTMLResponse)
def complete_purchase_wishes(
    request: Request,
    wish_ids: str = Form(""),
    db: Session = Depends(get_db)
):
    """Отметить выбранные хотелки выполненными"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    # Parse wish_ids (comma-separated)
    ids = [int(id.strip()) for id in wish_ids.split(",") if id.strip()]

    if ids:
        try:
            CompleteWishesUseCase(db).execute(
                wish_ids=ids,
                account_id=account_id,
                actor_user_id=account_id
            )
        except Exception:
            db.rollback()

    return RedirectResponse("/wishes/purchase", status_code=302)


@router.get("/wishes/new", response_class=HTMLResponse)
def new_wish_form(request: Request, db: Session = Depends(get_db)):
    """Форма создания новой хотелки"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    return templates.TemplateResponse("wish_form.html", {
        "request": request,
        "wish": None,
        "mode": "create",
    })


@router.post("/wishes/new", response_class=HTMLResponse)
def create_wish_handler(
    request: Request,
    title: str = Form(...),
    wish_type: str = Form(...),
    status: str = Form("IDEA"),
    target_date: str = Form(""),
    target_month: str = Form(""),
    estimated_amount: str = Form(""),
    is_recurring: bool = Form(False),
    notes: str = Form(""),
    db: Session = Depends(get_db)
):
    """Создать новую хотелку"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    # Parse optional fields
    target_date_val = target_date if target_date else None
    target_month_val = target_month if target_month else None
    estimated_amount_val = None
    if estimated_amount:
        try:
            estimated_amount_val = Decimal(estimated_amount)
        except:
            pass
    notes_val = notes if notes else None

    try:
        CreateWishUseCase(db).execute(
            account_id=account_id,
            title=title,
            wish_type=wish_type,
            status=status,
            target_date=target_date_val,
            target_month=target_month_val,
            estimated_amount=estimated_amount_val,
            is_recurring=is_recurring,
            notes=notes_val,
            actor_user_id=account_id
        )
        return RedirectResponse("/wishes", status_code=302)
    except (WishValidationError, ValueError) as e:
        return RedirectResponse(f"/wishes/new?error={str(e)}", status_code=302)


@router.get("/wishes/{wish_id}/edit", response_class=HTMLResponse)
def edit_wish_form(request: Request, wish_id: int, db: Session = Depends(get_db)):
    """Форма редактирования хотелки"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    wish = db.query(WishModel).filter(
        WishModel.wish_id == wish_id,
        WishModel.account_id == account_id
    ).first()

    if not wish:
        return RedirectResponse("/wishes", status_code=302)

    return templates.TemplateResponse("wish_form.html", {
        "request": request,
        "wish": wish,
        "mode": "edit",
    })


@router.post("/wishes/{wish_id}/edit", response_class=HTMLResponse)
def update_wish_handler(
    request: Request,
    wish_id: int,
    title: str = Form(...),
    wish_type: str = Form(...),
    status: str = Form(...),
    target_date: str = Form(""),
    target_month: str = Form(""),
    estimated_amount: str = Form(""),
    is_recurring: bool = Form(False),
    notes: str = Form(""),
    db: Session = Depends(get_db)
):
    """Обновить хотелку"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    account_id = request.session["user_id"]

    # Parse optional fields
    target_date_val = target_date if target_date else None
    target_month_val = target_month if target_month else None
    estimated_amount_val = None
    if estimated_amount:
        try:
            estimated_amount_val = Decimal(estimated_amount)
        except:
            pass
    notes_val = notes if notes else None

    try:
        UpdateWishUseCase(db).execute(
            wish_id=wish_id,
            account_id=account_id,
            actor_user_id=account_id,
            title=title,
            wish_type=wish_type,
            status=status,
            target_date=target_date_val,
            target_month=target_month_val,
            estimated_amount=str(estimated_amount_val) if estimated_amount_val else None,
            is_recurring=is_recurring,
            notes=notes_val
        )
        return RedirectResponse("/wishes", status_code=302)
    except (WishValidationError, ValueError) as e:
        return RedirectResponse(f"/wishes/{wish_id}/edit?error={str(e)}", status_code=302)


# --- XP / Profile ---

@router.get("/profile", response_class=HTMLResponse)
def profile_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    data = ProfileService(db).get_profile_data(user_id)

    # Expose theme_base / theme_mode for the Оформление picker
    current_theme = _get_user_theme(request)
    _parts = current_theme.rsplit("-", 1)
    data["current_theme"] = current_theme
    data["theme_base"] = _parts[0]
    data["theme_mode"] = _parts[1] if len(_parts) == 2 else "light"

    # Reminder presets
    from app.infrastructure.db.models import UserReminderTimePreset
    reminder_presets = db.query(UserReminderTimePreset).filter(
        UserReminderTimePreset.account_id == user_id,
    ).order_by(UserReminderTimePreset.sort_order).all()

    # Digest preferences
    user = db.query(User).filter(User.id == user_id).first()
    digest_morning = user.digest_morning if user and user.digest_morning is not None else True
    digest_evening = user.digest_evening if user and user.digest_evening is not None else True

    # Task-expense link setting
    enable_task_expense_link = user.enable_task_expense_link if user else False

    # Task templates setting
    enable_task_templates = user.enable_task_templates if user else False

    # Task reschedule reasons setting
    enable_task_reschedule_reasons = user.enable_task_reschedule_reasons if user else False

    return templates.TemplateResponse("profile.html", {
        "request": request,
        **data,
        "reminder_presets": reminder_presets,
        "digest_morning": digest_morning,
        "digest_evening": digest_evening,
        "enable_task_expense_link": enable_task_expense_link,
        "enable_task_templates": enable_task_templates,
        "enable_task_reschedule_reasons": enable_task_reschedule_reasons,
    })


@router.post("/profile/reminder-presets/create")
def create_reminder_preset_form(
    request: Request,
    label: str = Form(...),
    offset_minutes: int = Form(...),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    from app.application.reminder_presets import ReminderPresetsService, ReminderPresetValidationError
    try:
        ReminderPresetsService(db).create_preset(user_id, label, offset_minutes)
    except ReminderPresetValidationError:
        pass
    return RedirectResponse("/profile", status_code=302)


@router.post("/profile/reminder-presets/{preset_id}/delete")
def delete_reminder_preset_form(
    request: Request,
    preset_id: int,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    from app.application.reminder_presets import ReminderPresetsService, ReminderPresetValidationError
    try:
        ReminderPresetsService(db).delete_preset(preset_id, user_id)
    except ReminderPresetValidationError:
        pass
    return RedirectResponse("/profile", status_code=302)


@router.get("/profile/xp-history", response_class=HTMLResponse)
def xp_history_page(
    request: Request,
    db: Session = Depends(get_db),
    page: int = 1,
    from_date: str | None = None,
    to_date: str | None = None,
    min_xp: int | None = None,
    reason: str | None = None,
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    # Parse optional date strings (YYYY-MM-DD from <input type="date">)
    from datetime import date as _date
    from_date_val: _date | None = None
    to_date_val: _date | None = None
    try:
        if from_date:
            from_date_val = _date.fromisoformat(from_date)
    except ValueError:
        from_date_val = None
    try:
        if to_date:
            to_date_val = _date.fromisoformat(to_date)
    except ValueError:
        to_date_val = None

    page_size = 20
    items, total, total_pages = XpHistoryService(db).list_paginated(
        user_id=user_id,
        page=page,
        page_size=page_size,
        from_date=from_date_val,
        to_date=to_date_val,
        min_xp=min_xp,
        reason=reason or None,
    )

    return templates.TemplateResponse("profile_xp_history.html", {
        "request": request,
        "items": items,
        "total": total,
        "page": page,
        "total_pages": total_pages,
        "has_prev": page > 1,
        "has_next": page < total_pages,
        "from_date": from_date or "",
        "to_date": to_date or "",
        "min_xp": min_xp or "",
        "reason": reason or "",
        "reason_options": XP_REASON_FILTER_OPTIONS,
    })


@router.get("/profile/xp")
def get_xp_profile(
    request: Request,
    db: Session = Depends(get_db),
    account_id: int = Depends(require_user),
):
    profile = XpService(db).get_xp_profile(account_id)
    return JSONResponse(content=profile)


@router.get("/profile/activity")
def get_activity_profile(
    request: Request,
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})
    user_id = request.session["user_id"]
    today_msk = datetime.now(timezone(timedelta(hours=3))).date()
    summary = ActivityReadService(db).get_activity_summary(user_id, today_msk)
    return JSONResponse(content=summary)


@router.post("/flash/clear")
def flash_clear(request: Request):
    """Clear the session flash (called by client JS after showing the toast)."""
    request.session.pop("flash", None)
    return JSONResponse({"ok": True})


@router.post("/profile/theme")
def set_profile_theme(
    request: Request,
    theme: str = Form(...),
    db: Session = Depends(get_db),
):
    """Save the user's UI theme preference (called by JS — no page reload)."""
    if not require_user(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    if theme not in VALID_THEMES:
        return JSONResponse({"error": "invalid theme"}, status_code=400)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.theme = theme
        db.commit()

    request.session["user_theme"] = theme
    return JSONResponse({"ok": True, "theme": theme})


@router.post("/profile/save-theme")
def save_profile_theme_form(
    request: Request,
    theme: str = Form(...),
    db: Session = Depends(get_db),
):
    """Form-submit endpoint: saves theme and redirects back to /profile."""
    if "user_id" not in request.session:
        return RedirectResponse("/login", status_code=302)
    if theme not in VALID_THEMES:
        return RedirectResponse("/profile", status_code=302)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.theme = theme
        db.commit()

    request.session["user_theme"] = theme
    return RedirectResponse("/profile", status_code=302)


@router.post("/profile/digest")
def save_digest_settings(
    request: Request,
    db: Session = Depends(get_db),
    digest_morning: bool = Form(False),
    digest_evening: bool = Form(False),
):
    """Save daily digest push notification preferences."""
    if "user_id" not in request.session:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.digest_morning = digest_morning
        user.digest_evening = digest_evening
        db.commit()

    return RedirectResponse("/profile", status_code=302)


@router.post("/profile/task-expense-setting")
def save_task_expense_setting(
    request: Request,
    db: Session = Depends(get_db),
    enable_task_expense_link: bool = Form(False),
):
    """Toggle task-expense link feature."""
    if "user_id" not in request.session:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.enable_task_expense_link = enable_task_expense_link
        db.commit()

    return RedirectResponse("/profile", status_code=302)


@router.post("/profile/task-templates-setting")
def save_task_templates_setting(
    request: Request,
    db: Session = Depends(get_db),
    enable_task_templates: bool = Form(False),
):
    """Toggle task presets (quick templates) feature."""
    if "user_id" not in request.session:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.enable_task_templates = enable_task_templates
        db.commit()

    return RedirectResponse("/profile", status_code=302)


@router.post("/profile/reschedule-reasons-setting")
def save_reschedule_reasons_setting(
    request: Request,
    db: Session = Depends(get_db),
    enable_task_reschedule_reasons: bool = Form(False),
):
    """Toggle task reschedule reasons feature."""
    if "user_id" not in request.session:
        return JSONResponse({"error": "Not authenticated"}, status_code=401)

    user_id = request.session["user_id"]
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        user.enable_task_reschedule_reasons = enable_task_reschedule_reasons
        db.commit()

    return RedirectResponse("/profile", status_code=302)
