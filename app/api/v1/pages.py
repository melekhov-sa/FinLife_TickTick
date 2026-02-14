"""
SSR pages - server-side rendered HTML pages
"""
from pathlib import Path
from decimal import Decimal
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_

from app.api.deps import get_db, require_user
from app.infrastructure.db.models import (
    WalletBalance, CategoryInfo, TransactionFeed,
    WorkCategory, TaskModel, HabitModel, HabitOccurrence,
    TaskTemplateModel, TaskOccurrence,
    OperationTemplateModel, OperationOccurrence, RecurrenceRuleModel,
    CalendarEventModel, EventOccurrenceModel, EventFilterPresetModel,
)
from app.application.wallets import CreateWalletUseCase, RenameWalletUseCase, ArchiveWalletUseCase, UnarchiveWalletUseCase, WalletValidationError
from app.application.categories import CreateCategoryUseCase, UpdateCategoryUseCase, EnsureSystemCategoriesUseCase, CategoryValidationError
from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
from app.application.work_categories import CreateWorkCategoryUseCase, UpdateWorkCategoryUseCase, ArchiveWorkCategoryUseCase
from app.application.tasks_usecases import CreateTaskUseCase, CompleteTaskUseCase, ArchiveTaskUseCase, TaskValidationError
from app.application.habits import (
    CreateHabitUseCase, ArchiveHabitUseCase, UnarchiveHabitUseCase,
    ToggleHabitOccurrenceUseCase, CompleteHabitOccurrenceUseCase,
    SkipHabitOccurrenceUseCase, ResetHabitOccurrenceUseCase,
    HabitValidationError,
    get_today_habits, get_habits_grid, get_habits_analytics,
    get_global_heatmap, get_recent_milestones,
)
from app.application.task_templates import CreateTaskTemplateUseCase, CompleteTaskOccurrenceUseCase, SkipTaskOccurrenceUseCase, TaskTemplateValidationError
from app.application.operation_templates import CreateOperationTemplateUseCase, ConfirmOperationOccurrenceUseCase, SkipOperationOccurrenceUseCase
from app.application.occurrence_generator import OccurrenceGenerator
from app.application.events import (
    CreateEventUseCase, UpdateEventUseCase, DeactivateEventUseCase,
    CreateEventOccurrenceUseCase, CancelEventOccurrenceUseCase,
    CreateFilterPresetUseCase, SelectFilterPresetUseCase, DeleteFilterPresetUseCase,
    get_today_events, get_7days_events, get_history_events,
    validate_event_form, rebuild_event_occurrences,
)
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase, UpdateRecurrenceRuleUseCase
from app.application.budget import (
    EnsureBudgetMonthUseCase, SaveBudgetPlanUseCase, build_budget_view,
    BudgetViewService, swap_budget_position,
    BudgetMonth,
)
from app.application.budget_matrix import BudgetMatrixService, RANGE_LIMITS
from app.application.plan import build_plan_view
from app.utils.validation import validate_and_normalize_amount


router = APIRouter(tags=["pages"])

# Templates
templates_dir = Path(__file__).parent.parent.parent.parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))


# === Dashboard ===

@router.get("/", response_class=HTMLResponse)
def dashboard(request: Request, db: Session = Depends(get_db)):
    """Главная страница - dashboard"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Ensure system categories exist (создаются при первом входе)
    ensure_use_case = EnsureSystemCategoriesUseCase(db)
    ensure_use_case.execute(account_id=user_id, actor_user_id=user_id)

    # Получить кошельки
    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id,
        WalletBalance.is_archived == False
    ).all()

    # Подсчитать балансы по типам кошельков
    regular_balance = sum(w.balance for w in wallets if w.wallet_type == "REGULAR")
    savings_balance = sum(w.balance for w in wallets if w.wallet_type == "SAVINGS")
    credit_balance = sum(w.balance for w in wallets if w.wallet_type == "CREDIT")
    # Финансовый результат = счета + накопления + кредиты (кредиты уже отрицательные)
    financial_result_total = regular_balance + savings_balance + credit_balance

    # --- Изменения за 30 дней ---
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)

    # Собрать wallet_id -> wallet_type для быстрого lookup
    wallet_types = {w.wallet_id: w.wallet_type for w in wallets}

    # Получить все транзакции за 30 дней
    recent_txs = db.query(TransactionFeed).filter(
        TransactionFeed.account_id == user_id,
        TransactionFeed.occurred_at >= thirty_days_ago
    ).all()

    # Подсчитать net change для каждого кошелька
    wallet_changes: dict[int, Decimal] = {}
    for tx in recent_txs:
        if tx.operation_type == "INCOME" and tx.wallet_id:
            wallet_changes[tx.wallet_id] = wallet_changes.get(tx.wallet_id, Decimal("0")) + tx.amount
        elif tx.operation_type == "EXPENSE" and tx.wallet_id:
            wallet_changes[tx.wallet_id] = wallet_changes.get(tx.wallet_id, Decimal("0")) - tx.amount
        elif tx.operation_type == "TRANSFER":
            if tx.from_wallet_id:
                wallet_changes[tx.from_wallet_id] = wallet_changes.get(tx.from_wallet_id, Decimal("0")) - tx.amount
            if tx.to_wallet_id:
                wallet_changes[tx.to_wallet_id] = wallet_changes.get(tx.to_wallet_id, Decimal("0")) + tx.amount

    # Группировка изменений по типам кошельков
    change_regular = sum(
        amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "REGULAR"
    )
    change_savings = sum(
        amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "SAVINGS"
    )
    change_credit = sum(
        amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "CREDIT"
    )
    change_total = change_regular + change_savings + change_credit

    # --- Статистика за текущий месяц ---
    month_start = datetime(now.year, now.month, 1)
    if now.month == 12:
        month_end = datetime(now.year + 1, 1, 1)
    else:
        month_end = datetime(now.year, now.month + 1, 1)

    income_this_month = db.query(func.sum(TransactionFeed.amount)).filter(
        TransactionFeed.account_id == user_id,
        TransactionFeed.operation_type == "INCOME",
        TransactionFeed.occurred_at >= month_start,
        TransactionFeed.occurred_at < month_end
    ).scalar() or Decimal("0")

    expense_this_month = db.query(func.sum(TransactionFeed.amount)).filter(
        TransactionFeed.account_id == user_id,
        TransactionFeed.operation_type == "EXPENSE",
        TransactionFeed.occurred_at >= month_start,
        TransactionFeed.occurred_at < month_end
    ).scalar() or Decimal("0")

    month_result = income_this_month - expense_this_month

    # Русские названия месяцев
    month_names = {
        1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель",
        5: "Май", 6: "Июнь", 7: "Июль", 8: "Август",
        9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь"
    }
    current_month = f"{month_names[now.month]} {now.year}"

    # Получить последние 10 операций
    transactions = db.query(TransactionFeed).filter(
        TransactionFeed.account_id == user_id
    ).order_by(TransactionFeed.occurred_at.desc()).limit(10).all()

    # --- Tasks, Habits, Planned Operations for today ---
    today = date.today()

    # Generate occurrences lazily
    gen = OccurrenceGenerator(db)
    gen.generate_all(user_id)

    # Today's tasks: active one-off tasks with due_date <= today (or no due_date)
    today_tasks = db.query(TaskModel).filter(
        TaskModel.account_id == user_id,
        TaskModel.status == "ACTIVE",
    ).order_by(TaskModel.due_date.asc().nullslast()).all()

    # Today's task occurrences (from recurring templates)
    today_task_occs = db.query(TaskOccurrence).filter(
        TaskOccurrence.account_id == user_id,
        TaskOccurrence.scheduled_date == today,
    ).all()
    task_tmpl_map = {}
    if today_task_occs:
        tmpl_ids = {o.template_id for o in today_task_occs}
        for t in db.query(TaskTemplateModel).filter(TaskTemplateModel.template_id.in_(tmpl_ids)).all():
            task_tmpl_map[t.template_id] = t

    # Today's habits
    today_habit_occs = db.query(HabitOccurrence).filter(
        HabitOccurrence.account_id == user_id,
        HabitOccurrence.scheduled_date == today,
    ).all()
    habit_map = {}
    if today_habit_occs:
        habit_ids = {o.habit_id for o in today_habit_occs}
        for h in db.query(HabitModel).filter(HabitModel.habit_id.in_(habit_ids), HabitModel.is_archived == False).all():
            habit_map[h.habit_id] = h

    # Today's planned operations
    today_op_occs = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == user_id,
        OperationOccurrence.scheduled_date <= today,
        OperationOccurrence.status == "ACTIVE",
    ).order_by(OperationOccurrence.scheduled_date.asc()).all()
    op_tmpl_map = {}
    if today_op_occs:
        tmpl_ids = {o.template_id for o in today_op_occs}
        for t in db.query(OperationTemplateModel).filter(OperationTemplateModel.template_id.in_(tmpl_ids)).all():
            op_tmpl_map[t.template_id] = t

    # Events (7 days)
    events_7d = get_7days_events(db, user_id, today)
    event_map = {}
    if events_7d:
        ev_ids = {o.event_id for o in events_7d}
        for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(ev_ids)).all():
            event_map[ev.event_id] = ev
    # Work categories for event display
    wc_map = {}
    if event_map:
        wc_ids = {ev.category_id for ev in event_map.values() if ev.category_id}
        if wc_ids:
            for wc in db.query(WorkCategory).filter(WorkCategory.category_id.in_(wc_ids)).all():
                wc_map[wc.category_id] = wc

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "wallets": wallets,
        "transactions": transactions,
        # Балансы
        "regular_balance": regular_balance,
        "savings_balance": savings_balance,
        "credit_balance": credit_balance,
        "financial_result_total": financial_result_total,
        # Изменения за 30 дней
        "change_regular": change_regular,
        "change_savings": change_savings,
        "change_credit": change_credit,
        "change_total": change_total,
        # Месяц
        "income_this_month": income_this_month,
        "expense_this_month": expense_this_month,
        "month_result": month_result,
        "current_month": current_month,
        # Tasks, Habits, Planned Operations
        "today": today,
        "today_tasks": today_tasks,
        "today_task_occs": today_task_occs,
        "task_tmpl_map": task_tmpl_map,
        "today_habit_occs": today_habit_occs,
        "habit_map": habit_map,
        "today_op_occs": today_op_occs,
        "op_tmpl_map": op_tmpl_map,
        # Events
        "events_7d": events_7d,
        "event_map": event_map,
        "wc_map": wc_map,
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

    return templates.TemplateResponse("wallets.html", {
        "request": request,
        "wallets": wallets
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

    # KPI по текущему фильтру
    kpi_income = sum(
        (t.amount for t in transactions if t.operation_type == "INCOME"), Decimal("0")
    )
    kpi_expense = sum(
        (t.amount for t in transactions if t.operation_type == "EXPENSE"), Decimal("0")
    )

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
        "kpi_income": kpi_income,
        "kpi_expense": kpi_expense,
    })


@router.post("/transactions/create", response_class=HTMLResponse)
def create_transaction_form(
    request: Request,
    operation_type: str = Form(...),
    amount: str = Form(...),
    description: str = Form(...),
    wallet_id: int | None = Form(None),
    from_wallet_id: int | None = Form(None),
    to_wallet_id: int | None = Form(None),
    category_id: int | None = Form(None),
    occurred_at: str = Form(""),
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

    try:
        use_case = CreateTransactionUseCase(db)
        amount_decimal = Decimal(amount)

        if operation_type == "INCOME":
            if not wallet_id:
                raise ValueError("wallet_id required for INCOME")
            wallet = db.query(WalletBalance).filter(
                WalletBalance.wallet_id == wallet_id
            ).first()
            if not wallet:
                raise ValueError("Wallet not found")

            use_case.execute_income(
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

            use_case.execute_expense(
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

            use_case.execute_transfer(
                account_id=user_id,
                from_wallet_id=from_wallet_id,
                to_wallet_id=to_wallet_id,
                amount=amount_decimal,
                currency=from_wallet.currency,
                description=description,
                occurred_at=tx_occurred_at,
                actor_user_id=user_id,
            )
        else:
            raise ValueError("Invalid operation_type")

        return RedirectResponse("/transactions", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/transactions?error={e}", status_code=302)


# === Categories ===

@router.get("/categories", response_class=HTMLResponse)
def categories_page(request: Request, db: Session = Depends(get_db)):
    """Страница управления категориями (статьями)"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    # Ensure system categories exist
    ensure_use_case = EnsureSystemCategoriesUseCase(db)
    ensure_use_case.execute(account_id=user_id, actor_user_id=user_id)

    # Get all categories (including archived for display)
    categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id
    ).order_by(
        CategoryInfo.category_type.asc(),  # EXPENSE первым, потом INCOME
        CategoryInfo.is_system.desc(),     # Системные сверху
        CategoryInfo.title.asc()
    ).all()

    return templates.TemplateResponse("categories.html", {
        "request": request,
        "categories": categories
    })


@router.post("/categories/create", response_class=HTMLResponse)
def create_category_form(
    request: Request,
    title: str = Form(...),
    category_type: str = Form(...),
    parent_id: int | None = Form(None),
    db: Session = Depends(get_db)
):
    """Обработка формы создания категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        if category_type not in ("INCOME", "EXPENSE"):
            raise ValueError("Неверный тип категории")

        use_case = CreateCategoryUseCase(db)
        use_case.execute(
            account_id=user_id,
            title=title,
            category_type=category_type,
            parent_id=parent_id,
            is_system=False,
            actor_user_id=user_id
        )
        return RedirectResponse("/categories", status_code=302)
    except IntegrityError as e:
        db.rollback()
        categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id
        ).all()
        return templates.TemplateResponse("categories.html", {
            "request": request,
            "categories": categories,
            "error": "Категория уже создается. Пожалуйста, обновите страницу."
        })
    except Exception as e:
        db.rollback()
        categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id
        ).all()
        return templates.TemplateResponse("categories.html", {
            "request": request,
            "categories": categories,
            "error": str(e)
        })


@router.post("/categories/{category_id}/update", response_class=HTMLResponse)
def update_category_form(
    request: Request,
    category_id: int,
    title: str = Form(...),
    parent_id: int | None = Form(None),
    db: Session = Depends(get_db)
):
    """Обработка формы редактирования категории"""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    try:
        use_case = UpdateCategoryUseCase(db)
        use_case.execute(
            category_id=category_id,
            account_id=user_id,
            title=title,
            parent_id=parent_id,
            actor_user_id=user_id
        )
        return RedirectResponse("/categories", status_code=302)
    except Exception as e:
        db.rollback()
        categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id
        ).order_by(
            CategoryInfo.category_type.asc(),
            CategoryInfo.is_system.desc(),
            CategoryInfo.title.asc()
        ).all()
        return templates.TemplateResponse("categories.html", {
            "request": request,
            "categories": categories,
            "error": str(e)
        })


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


# === Tasks ===

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

    return templates.TemplateResponse("tasks.html", {
        "request": request, "tasks": tasks, "task_templates": task_templates,
        "task_occurrences": task_occurrences, "work_categories": work_categories, "today": today,
    })


@router.post("/tasks/create")
def create_task_form(
    request: Request,
    mode: str = Form("once"),
    title: str = Form(...),
    due_date: str = Form(""),
    freq: str = Form(""),
    interval: int = Form(1),
    start_date: str = Form(""),
    by_monthday: int | None = Form(None),
    weekday_MO: str = Form(""), weekday_TU: str = Form(""), weekday_WE: str = Form(""),
    weekday_TH: str = Form(""), weekday_FR: str = Form(""), weekday_SA: str = Form(""),
    weekday_SU: str = Form(""),
    category_id: int | None = Form(None),
    note: str = Form(""),
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
        return templates.TemplateResponse("tasks.html", {"request": request, "tasks": tasks, "task_templates": task_tmpls, "task_occurrences": task_occs, "work_categories": work_cats, "today": today, "error": msg})

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
            )
        else:
            # One-off task — ignore recurring fields
            CreateTaskUseCase(db).execute(
                account_id=user_id, title=title, note=note.strip() or None,
                due_date=due_date.strip() or None, category_id=category_id, actor_user_id=user_id,
            )
    except (TaskValidationError, TaskTemplateValidationError) as e:
        return _render_error(str(e))
    except Exception:
        db.rollback()
    return RedirectResponse("/tasks", status_code=302)


@router.post("/tasks/{task_id}/complete")
def complete_task_form(request: Request, task_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CompleteTaskUseCase(db).execute(task_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
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




@router.post("/tasks/occurrences/{occurrence_id}/complete")
def complete_task_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        CompleteTaskOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
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

@router.get("/planned-operations", response_class=HTMLResponse)
def planned_operations_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    gen = OccurrenceGenerator(db)
    gen.generate_operation_occurrences(user_id)

    op_templates = db.query(OperationTemplateModel).filter(
        OperationTemplateModel.account_id == user_id, OperationTemplateModel.is_archived == False,
    ).order_by(OperationTemplateModel.title).all()

    today = date.today()
    op_occurrences = db.query(OperationOccurrence).filter(
        OperationOccurrence.account_id == user_id,
        OperationOccurrence.scheduled_date >= today - timedelta(days=30),
        OperationOccurrence.scheduled_date <= today + timedelta(days=60),
    ).order_by(OperationOccurrence.scheduled_date.asc()).all()

    wallets = db.query(WalletBalance).filter(
        WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
    ).all()
    fin_categories = db.query(CategoryInfo).filter(
        CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
    ).all()

    return templates.TemplateResponse("planned_operations.html", {
        "request": request, "op_templates": op_templates, "op_occurrences": op_occurrences,
        "wallets": wallets, "fin_categories": fin_categories, "today": today,
    })


@router.post("/planned-operations/create")
def create_operation_template_form(
    request: Request, title: str = Form(...), kind: str = Form(...), amount: str = Form(...),
    freq: str = Form(...), interval: int = Form(1), start_date: str = Form(...),
    wallet_id: int | None = Form(None), category_id: int | None = Form(None),
    from_wallet_id: int | None = Form(None), to_wallet_id: int | None = Form(None),
    by_monthday: int | None = Form(None), note: str = Form(""),
    db: Session = Depends(get_db)
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateOperationTemplateUseCase(db).execute(
            account_id=user_id, title=title, freq=freq, interval=interval,
            start_date=start_date, kind=kind, amount=amount,
            wallet_id=wallet_id, category_id=category_id,
            from_wallet_id=from_wallet_id, to_wallet_id=to_wallet_id,
            note=note.strip() or None,
            by_monthday=by_monthday, actor_user_id=user_id)
        return RedirectResponse("/planned-operations", status_code=302)
    except Exception as e:
        db.rollback()
        today = date.today()
        gen = OccurrenceGenerator(db)
        gen.generate_operation_occurrences(user_id)
        op_templates = db.query(OperationTemplateModel).filter(
            OperationTemplateModel.account_id == user_id, OperationTemplateModel.is_archived == False,
        ).order_by(OperationTemplateModel.title).all()
        op_occurrences = db.query(OperationOccurrence).filter(
            OperationOccurrence.account_id == user_id,
            OperationOccurrence.scheduled_date >= today - timedelta(days=30),
            OperationOccurrence.scheduled_date <= today + timedelta(days=60),
        ).order_by(OperationOccurrence.scheduled_date.asc()).all()
        wallets = db.query(WalletBalance).filter(
            WalletBalance.account_id == user_id, WalletBalance.is_archived == False,
        ).all()
        fin_categories = db.query(CategoryInfo).filter(
            CategoryInfo.account_id == user_id, CategoryInfo.is_archived == False,
        ).all()
        return templates.TemplateResponse("planned_operations.html", {
            "request": request, "op_templates": op_templates, "op_occurrences": op_occurrences,
            "wallets": wallets, "fin_categories": fin_categories, "today": today,
            "error": str(e),
        })


@router.post("/planned-operations/occurrences/{occurrence_id}/confirm")
def confirm_operation_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        ConfirmOperationOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/planned-operations", status_code=302)


@router.post("/planned-operations/occurrences/{occurrence_id}/skip")
def skip_operation_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    try:
        SkipOperationOccurrenceUseCase(db).execute(occurrence_id, request.session["user_id"], actor_user_id=request.session["user_id"])
    except Exception:
        db.rollback()
    return RedirectResponse("/planned-operations", status_code=302)


# === Events ===

@router.get("/events", response_class=HTMLResponse)
def events_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    gen = OccurrenceGenerator(db)
    gen.generate_event_occurrences(user_id)

    today = date.today()
    today_events = get_today_events(db, user_id, today)
    week_events = get_7days_events(db, user_id, today)

    # Build event_id -> CalendarEventModel map
    ev_ids = {o.event_id for o in today_events} | {o.event_id for o in week_events}
    event_map = {}
    if ev_ids:
        for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(ev_ids)).all():
            event_map[ev.event_id] = ev

    # All active events for management section
    active_events = db.query(CalendarEventModel).filter(
        CalendarEventModel.account_id == user_id,
        CalendarEventModel.is_active == True,
    ).order_by(CalendarEventModel.title).all()

    # Work categories for forms and display
    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    wc_map = {wc.category_id: wc for wc in work_categories}

    # Filter presets
    presets = db.query(EventFilterPresetModel).filter(
        EventFilterPresetModel.account_id == user_id,
    ).order_by(EventFilterPresetModel.name).all()

    # Recurrence rules for active events (for inline edit)
    rule_ids = {ev.repeat_rule_id for ev in active_events if ev.repeat_rule_id}
    rule_map = {}
    if rule_ids:
        for r in db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all():
            rule_map[r.rule_id] = r

    return templates.TemplateResponse("events.html", {
        "request": request,
        "today": today,
        "today_events": today_events,
        "week_events": week_events,
        "event_map": event_map,
        "active_events": active_events,
        "work_categories": work_categories,
        "wc_map": wc_map,
        "presets": presets,
        "rule_map": rule_map,
    })


@router.get("/events/history", response_class=HTMLResponse)
def events_history_page(request: Request, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    today = date.today()
    history = get_history_events(db, user_id, today, limit=100)

    ev_ids = {o.event_id for o in history}
    event_map = {}
    if ev_ids:
        for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(ev_ids)).all():
            event_map[ev.event_id] = ev

    work_categories = db.query(WorkCategory).filter(
        WorkCategory.account_id == user_id, WorkCategory.is_archived == False
    ).order_by(WorkCategory.title).all()
    wc_map = {wc.category_id: wc for wc in work_categories}

    return templates.TemplateResponse("events_history.html", {
        "request": request,
        "history": history,
        "event_map": event_map,
        "wc_map": wc_map,
        "today": today,
    })


@router.post("/events/create")
def create_event_form(
    request: Request,
    title: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(""),
    importance: int = Form(0),
    event_type: str = Form("onetime"),
    # One-time fields
    start_date: str = Form(""),
    start_time: str = Form(""),
    end_date: str = Form(""),
    end_time: str = Form(""),
    # Recurring fields
    recurrence_type: str = Form(""),
    rec_month: int | None = Form(None),
    rec_day: int | None = Form(None),
    rec_weekdays: list[str] = Form([]),
    rec_interval: int = Form(1),
    rec_start_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]

    # Server-side validation
    error = validate_event_form(
        event_type=event_type,
        title=title,
        recurrence_type=recurrence_type,
        start_date=start_date,
        rec_month=rec_month,
        rec_day=rec_day,
        rec_weekdays=rec_weekdays or None,
        rec_interval=rec_interval,
        rec_start_date=rec_start_date,
    )
    if error:
        # Re-render events page with error
        today = date.today()
        gen = OccurrenceGenerator(db)
        gen.generate_event_occurrences(user_id)
        today_events = get_today_events(db, user_id, today)
        week_events = get_7days_events(db, user_id, today)
        ev_ids = {o.event_id for o in today_events} | {o.event_id for o in week_events}
        event_map = {}
        if ev_ids:
            for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(ev_ids)).all():
                event_map[ev.event_id] = ev
        active_events = db.query(CalendarEventModel).filter(
            CalendarEventModel.account_id == user_id, CalendarEventModel.is_active == True,
        ).order_by(CalendarEventModel.title).all()
        work_categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False
        ).order_by(WorkCategory.title).all()
        wc_map = {wc.category_id: wc for wc in work_categories}
        presets = db.query(EventFilterPresetModel).filter(
            EventFilterPresetModel.account_id == user_id,
        ).order_by(EventFilterPresetModel.name).all()
        rule_ids = {ev.repeat_rule_id for ev in active_events if ev.repeat_rule_id}
        rule_map = {}
        if rule_ids:
            for r in db.query(RecurrenceRuleModel).filter(RecurrenceRuleModel.rule_id.in_(rule_ids)).all():
                rule_map[r.rule_id] = r
        return templates.TemplateResponse("events.html", {
            "request": request, "today": today, "today_events": today_events,
            "week_events": week_events, "event_map": event_map,
            "active_events": active_events, "work_categories": work_categories,
            "wc_map": wc_map, "presets": presets, "rule_map": rule_map, "error": error,
        })

    try:
        today = date.today()
        if event_type == "onetime":
            CreateEventUseCase(db).execute(
                account_id=user_id,
                title=title,
                category_id=category_id,
                description=description.strip() or None,
                importance=importance,
                occ_start_date=start_date.strip() or None,
                occ_start_time=start_time.strip() or None,
                occ_end_date=end_date.strip() or None,
                occ_end_time=end_time.strip() or None,
                actor_user_id=user_id,
            )
        else:
            # Map UI recurrence type to RecurrenceRule params
            freq = None
            interval = 1
            rule_start_date = None
            by_weekday = None
            by_monthday = None
            by_month = None
            by_monthday_for_year = None

            if recurrence_type == "yearly":
                freq = "YEARLY"
                by_month = rec_month
                by_monthday_for_year = rec_day
                rule_start_date = f"{today.year}-{rec_month:02d}-{rec_day:02d}"
            elif recurrence_type == "monthly":
                freq = "MONTHLY"
                by_monthday = rec_day
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
                account_id=user_id,
                title=title,
                category_id=category_id,
                description=description.strip() or None,
                importance=importance,
                freq=freq,
                interval=interval,
                start_date=rule_start_date,
                by_weekday=by_weekday,
                by_monthday=by_monthday,
                by_month=by_month,
                by_monthday_for_year=by_monthday_for_year,
                actor_user_id=user_id,
            )
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/{event_id}/update")
def update_event_form(
    request: Request,
    event_id: int,
    title: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(""),
    importance: int = Form(0),
    # Recurrence editing fields (optional)
    edit_recurrence: str = Form(""),
    recurrence_type: str = Form(""),
    rec_month: int | None = Form(None),
    rec_day: int | None = Form(None),
    rec_weekdays: list[str] = Form([]),
    rec_interval: int = Form(1),
    rec_start_date: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        # Update basic event fields
        UpdateEventUseCase(db).execute(
            event_id=event_id,
            account_id=user_id,
            title=title.strip(),
            category_id=category_id,
            description=description.strip() or None,
            importance=importance,
            actor_user_id=user_id,
        )

        today = date.today()

        # Handle recurrence changes
        if edit_recurrence == "1" and recurrence_type:
            ev = db.query(CalendarEventModel).filter(
                CalendarEventModel.event_id == event_id,
                CalendarEventModel.account_id == user_id,
            ).first()

            if ev:
                # Build new rule params
                freq = None
                interval = 1
                rule_start_date = None
                by_weekday = None
                by_monthday = None
                by_month = None
                by_monthday_for_year = None

                if recurrence_type == "yearly":
                    freq = "YEARLY"
                    by_month = rec_month
                    by_monthday_for_year = rec_day
                    rule_start_date = f"{today.year}-{rec_month:02d}-{rec_day:02d}"
                elif recurrence_type == "monthly":
                    freq = "MONTHLY"
                    by_monthday = rec_day
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
                    if ev.repeat_rule_id:
                        # Update existing rule
                        UpdateRecurrenceRuleUseCase(db).execute(
                            rule_id=ev.repeat_rule_id,
                            account_id=user_id,
                            freq=freq,
                            interval=interval,
                            start_date=rule_start_date,
                            by_weekday=by_weekday,
                            by_monthday=by_monthday,
                            by_month=by_month,
                            by_monthday_for_year=by_monthday_for_year,
                            actor_user_id=user_id,
                        )
                        # Rebuild occurrences
                        rebuild_event_occurrences(db, event_id, user_id, today)
                    else:
                        # Convert one-time to recurring: create new rule
                        rule_uc = CreateRecurrenceRuleUseCase(db)
                        new_rule_id = rule_uc.execute(
                            account_id=user_id,
                            freq=freq,
                            interval=interval,
                            start_date=rule_start_date,
                            by_weekday=by_weekday,
                            by_monthday=by_monthday,
                            by_month=by_month,
                            by_monthday_for_year=by_monthday_for_year,
                            actor_user_id=user_id,
                        )
                        UpdateEventUseCase(db).execute(
                            event_id=event_id,
                            account_id=user_id,
                            repeat_rule_id=new_rule_id,
                            actor_user_id=user_id,
                        )
                        OccurrenceGenerator(db).generate_event_occurrences(user_id)
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/{event_id}/deactivate")
def deactivate_event_form(request: Request, event_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        DeactivateEventUseCase(db).execute(event_id, user_id, actor_user_id=user_id)
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/occurrences/create")
def create_event_occurrence_form(
    request: Request,
    event_id: int = Form(...),
    start_date: str = Form(...),
    start_time: str = Form(""),
    end_date: str = Form(""),
    end_time: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateEventOccurrenceUseCase(db).execute(
            event_id=event_id,
            account_id=user_id,
            start_date=start_date,
            start_time=start_time.strip() or None,
            end_date=end_date.strip() or None,
            end_time=end_time.strip() or None,
            source="manual",
            actor_user_id=user_id,
        )
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/occurrences/{occurrence_id}/cancel")
def cancel_event_occurrence_form(request: Request, occurrence_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CancelEventOccurrenceUseCase(db).execute(occurrence_id, user_id, actor_user_id=user_id)
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/presets/create")
def create_event_preset_form(
    request: Request,
    name: str = Form(...),
    category_ids: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        ids = [int(x.strip()) for x in category_ids.split(",") if x.strip()]
        CreateFilterPresetUseCase(db).execute(
            account_id=user_id,
            name=name,
            category_ids=ids or None,
            actor_user_id=user_id,
        )
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/presets/{preset_id}/select")
def select_event_preset_form(request: Request, preset_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        SelectFilterPresetUseCase(db).execute(preset_id, user_id, actor_user_id=user_id)
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


@router.post("/events/presets/{preset_id}/delete")
def delete_event_preset_form(request: Request, preset_id: int, db: Session = Depends(get_db)):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        DeleteFilterPresetUseCase(db).execute(preset_id, user_id, actor_user_id=user_id)
    except Exception:
        db.rollback()
    return RedirectResponse("/events", status_code=302)


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
    grain: str = "month",
    year: int | None = None,
    month: int | None = None,
    date: str | None = None,
    range_count: int = 3,
    category_ids: str = "",
    db: Session = Depends(get_db),
):
    """Budget page — multi-period matrix view."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    if grain not in ("day", "week", "month", "year"):
        grain = "month"

    max_rc = RANGE_LIMITS.get(grain, 12)
    range_count = max(1, min(range_count, max_rc))

    now = datetime.now()

    if year is None:
        year = now.year
    if month is None:
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

    # Parse category filter
    selected_ids = None
    if category_ids.strip():
        try:
            selected_ids = [int(x.strip()) for x in category_ids.split(",") if x.strip()]
        except ValueError:
            selected_ids = None
    if selected_ids is not None and len(selected_ids) == 0:
        selected_ids = None

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
            )

    # Build matrix view
    view = BudgetMatrixService(db).build(
        account_id=user_id,
        grain=grain,
        range_count=range_count,
        anchor_date=date_param if grain in ("day", "week") else None,
        anchor_year=year,
        anchor_month=month,
        category_ids=selected_ids,
    )

    cat_filter_qs = f"&category_ids={category_ids}" if category_ids.strip() else ""
    rc_qs = f"&range_count={range_count}"

    prev_url, next_url = _budget_matrix_nav_urls(
        grain, range_count, year, month, date_param, cat_filter_qs,
    )

    # Grain selector URLs
    grains = [
        {"value": "day", "label": "День", "url": f"/budget?grain=day&date={date_param.isoformat()}{rc_qs}{cat_filter_qs}"},
        {"value": "week", "label": "Неделя", "url": f"/budget?grain=week&date={date_param.isoformat()}{rc_qs}{cat_filter_qs}"},
        {"value": "month", "label": "Месяц", "url": f"/budget?grain=month&year={year}&month={month}{rc_qs}{cat_filter_qs}"},
        {"value": "year", "label": "Год", "url": f"/budget?grain=year&year={year}{rc_qs}{cat_filter_qs}"},
    ]

    return templates.TemplateResponse("budget.html", {
        "request": request,
        "view": view,
        "grain": grain,
        "grains": grains,
        "range_count": range_count,
        "max_range": max_rc,
        "prev_url": prev_url,
        "next_url": next_url,
        "selected_category_ids": selected_ids or [],
        "category_ids_str": category_ids.strip(),
        "anchor_year": year,
        "anchor_month": month,
        "anchor_date": date_param.isoformat() if date_param else "",
    })


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
        )
    except Exception:
        db.rollback()

    return RedirectResponse(f"/budget?grain=month&year={year}&month={month}", status_code=302)


@router.post("/budget/order/move")
def move_budget_category_order(
    request: Request,
    category_id: int = Form(...),
    kind: str = Form(...),
    direction: str = Form(...),
    year: int = Form(...),
    month: int = Form(...),
    db: Session = Depends(get_db),
):
    """Move a budget category up or down in the ordering."""
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)

    user_id = request.session["user_id"]

    budget_month = db.query(BudgetMonth).filter(
        BudgetMonth.account_id == user_id,
        BudgetMonth.year == year,
        BudgetMonth.month == month,
    ).first()

    if budget_month:
        swap_budget_position(db, budget_month.id, category_id, kind, direction)
        db.commit()

    return RedirectResponse(f"/budget?grain=month&year={year}&month={month}", status_code=302)


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
    try:
        CompleteTaskUseCase(db).execute(task_id, request.session["user_id"], actor_user_id=request.session["user_id"])
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
    if tmpl.kind in ("INCOME", "EXPENSE"):
        categories = [c for c in categories if c.category_type == tmpl.kind]

    kind_labels = {"INCOME": "Доход", "EXPENSE": "Расход", "TRANSFER": "Перевод"}

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
    from_wallet_id: int | None = Form(None),
    to_wallet_id: int | None = Form(None),
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
            override_from_wallet_id=from_wallet_id,
            override_to_wallet_id=to_wallet_id,
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
