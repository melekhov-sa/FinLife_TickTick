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
    SubscriptionModel, SubscriptionMemberModel, SubscriptionCoverageModel,
    ContactModel, WishModel,
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
from app.application.transactions import CreateTransactionUseCase, TransactionValidationError
from app.application.work_categories import CreateWorkCategoryUseCase, UpdateWorkCategoryUseCase, ArchiveWorkCategoryUseCase, UnarchiveWorkCategoryUseCase, WorkCategoryValidationError
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
    EventValidationError, validate_event_form, rebuild_event_occurrences,
)
from app.application.recurrence_rules import CreateRecurrenceRuleUseCase, UpdateRecurrenceRuleUseCase
from app.application.budget import (
    EnsureBudgetMonthUseCase, SaveBudgetPlanUseCase, build_budget_view,
    BudgetViewService, swap_budget_position,
    BudgetMonth,
)
from app.application.budget_matrix import BudgetMatrixService, RANGE_LIMITS
from app.application.plan import build_plan_view
from app.application.dashboard import DashboardService
from app.application.subscriptions import (
    CreateSubscriptionUseCase, UpdateSubscriptionUseCase,
    ArchiveSubscriptionUseCase, UnarchiveSubscriptionUseCase,
    AddSubscriptionMemberUseCase, ArchiveMemberUseCase, UnarchiveMemberUseCase, UpdateMemberPaymentUseCase,
    CreateSubscriptionCoverageUseCase, CreateInitialCoverageUseCase,
    SubscriptionValidationError,
    validate_coverage_before_transaction, compute_subscription_detail,
    compute_subscriptions_overview,
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
from app.utils.validation import validate_and_normalize_amount


router = APIRouter(tags=["pages"])

# Templates
templates_dir = Path(__file__).parent.parent.parent.parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))


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

    # 2. Upcoming payments
    upcoming_payments = svc.get_upcoming_payments(user_id, today, limit=3)

    # 3. Habit heatmap (15 days, 3 rows x 5 cols)
    habit_heatmap = svc.get_habit_heatmap(user_id, today, days=15)

    # 4. Financial summary
    fin = svc.get_financial_summary(user_id, today)
    current_month = f"{MONTH_NAMES_RU[today.month]} {today.year}"

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "today": today,
        # Today block
        "overdue_items": today_block["overdue"],
        "active_items": today_block["active"],
        "done_items": today_block["done"],
        "progress": today_block["progress"],
        # Upcoming payments
        "upcoming_payments": upcoming_payments,
        # Habit heatmap
        "habit_heatmap": habit_heatmap,
        # Financial
        "current_month": current_month,
        "income": fin["income"],
        "expense": fin["expense"],
        "difference": fin["difference"],
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

    # Calculate summary by wallet type
    summary = {
        "REGULAR": {"count": 0, "total": Decimal("0")},
        "CREDIT": {"count": 0, "total": Decimal("0")},
        "SAVINGS": {"count": 0, "total": Decimal("0")}
    }

    for wd in wallet_data:
        w = wd["wallet"]
        if not w.is_archived:
            wtype = w.wallet_type
            if wtype in summary:
                summary[wtype]["count"] += 1
                summary[wtype]["total"] += w.balance

    return templates.TemplateResponse("wallets.html", {
        "request": request,
        "wallet_data": wallet_data,
        "summary": summary
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
        "sub_category_map": sub_category_map,
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
    category_id: int | None = Form(None),
    occurred_at: str = Form(""),
    # Subscription coverage fields (optional)
    sub_subscription_id: int | None = Form(None),
    sub_payer_type: str | None = Form(None),
    sub_member_id: int | None = Form(None),
    sub_start_date: str | None = Form(None),
    sub_end_date: str | None = Form(None),
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

        return RedirectResponse("/transactions", status_code=302)
    except Exception as e:
        db.rollback()
        return RedirectResponse(f"/transactions?error={e}", status_code=302)


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

    return templates.TemplateResponse("category_form.html", {
        "request": request,
        "mode": "new",
        "kind": kind
    })


@router.post("/categories/new", response_class=HTMLResponse)
def create_category_handler(
    request: Request,
    title: str = Form(...),
    kind: str = Form(...),
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

        use_case = CreateCategoryUseCase(db)
        use_case.execute(
            account_id=user_id,
            title=title,
            category_type=category_type,
            parent_id=None,  # No hierarchy in UI
            is_system=False,
            actor_user_id=user_id
        )
        return RedirectResponse(f"/categories?kind={kind}", status_code=302)
    except Exception as e:
        db.rollback()
        return templates.TemplateResponse("category_form.html", {
            "request": request,
            "mode": "new",
            "kind": kind,
            "form_title": title,
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

    return templates.TemplateResponse("category_form.html", {
        "request": request,
        "mode": "edit",
        "category": category,
        "kind": kind
    })


@router.post("/categories/{category_id}/edit", response_class=HTMLResponse)
def update_category_handler(
    request: Request,
    category_id: int,
    title: str = Form(...),
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

        # Update title
        use_case = UpdateCategoryUseCase(db)
        use_case.execute(
            category_id=category_id,
            account_id=user_id,
            title=title,
            parent_id=...,  # Don't change parent_id
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
        return templates.TemplateResponse("category_form.html", {
            "request": request,
            "mode": "edit",
            "category": category,
            "kind": kind,
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
    category_id: int | None = Form(None),
    freq: str = Form(...),
    interval: int = Form(1),
    start_date: str = Form(...),
    by_monthday: int | None = Form(None),
    note: str = Form(""),
    db: Session = Depends(get_db),
):
    if not require_user(request):
        return RedirectResponse("/login", status_code=302)
    user_id = request.session["user_id"]
    try:
        CreateOperationTemplateUseCase(db).execute(
            account_id=user_id, title=title, freq=freq, interval=interval,
            start_date=start_date, kind=kind, amount=amount,
            wallet_id=wallet_id, category_id=category_id,
            note=note.strip() or None,
            by_monthday=by_monthday, actor_user_id=user_id,
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
            "form_wallet_id": wallet_id, "form_category_id": category_id,
            "form_freq": freq, "form_interval": interval,
            "form_start_date": start_date, "form_by_monthday": by_monthday,
            "form_note": note,
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
    category_id: int | None = Form(None),
    note: str = Form(""),
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
            category_id=category_id,
            note=note.strip() or None,
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

    return templates.TemplateResponse("subscription_detail.html", {
        "request": request,
        "sub": sub,
        "selected": selected,
        "selected_label": f"{MONTH_NAMES_RU[selected.month]} {selected.year}",
        "prev_month": prev_month.strftime("%Y-%m"),
        "next_month": next_month.strftime("%Y-%m"),
        "detail": detail,
        "cat_map": cat_map,
        "month_names": MONTH_NAMES_RU,
        "members": members,
        "contact_map": contact_map,
        "error": error,
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
        categories = db.query(WorkCategory).filter(
            WorkCategory.account_id == user_id, WorkCategory.is_archived == False,
        ).order_by(WorkCategory.title).all()
        return templates.TemplateResponse("event_form.html", {
            "request": request, "mode": "new", "categories": categories, "error": error,
            "form_title": title, "form_category_id": category_id, "form_description": description,
            "form_event_type": event_type, "form_start_date": start_date, "form_start_time": start_time,
            "form_end_date": end_date, "form_end_time": end_time,
            "form_recurrence_type": recurrence_type, "form_rec_month": rec_month,
            "form_rec_day": rec_day, "form_rec_weekdays": rec_weekdays,
            "form_rec_interval": rec_interval, "form_rec_start_date": rec_start_date,
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
                account_id=user_id, title=title, category_id=category_id,
                description=description.strip() or None,
                freq=freq, interval=interval, start_date=rule_start_date,
                by_weekday=by_weekday, by_monthday=by_monthday,
                by_month=by_month, by_monthday_for_year=by_monthday_for_year,
                actor_user_id=user_id,
            )
    except Exception:
        db.rollback()
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
                        actor_user_id=user_id,
                    )
                    rebuild_event_occurrences(db, event_id, user_id, today)
                elif ev:
                    new_rule_id = CreateRecurrenceRuleUseCase(db).execute(
                        account_id=user_id, freq=freq, interval=interval,
                        start_date=rule_start_date, by_weekday=by_weekday,
                        by_monthday=by_monthday, by_month=by_month,
                        by_monthday_for_year=by_monthday_for_year,
                        actor_user_id=user_id,
                    )
                    UpdateEventUseCase(db).execute(
                        event_id=event_id, account_id=user_id,
                        repeat_rule_id=new_rule_id, actor_user_id=user_id,
                    )
                    OccurrenceGenerator(db).generate_event_occurrences(user_id)
        elif event_type == "onetime" and start_date:
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
        return templates.TemplateResponse("event_form.html", {
            "request": request, "mode": "edit", "event": ev,
            "rule": rule, "categories": categories, "error": str(e),
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
    if status and status != "all":
        statuses = [s.strip() for s in status.split(",")]

    service = WishesService(db)
    wishes = service.get_filtered_wishes(
        account_id=account_id,
        period=period,
        statuses=statuses,
        search=search if search else None
    )

    # Group by type
    grouped = service.group_by_type(wishes)

    return templates.TemplateResponse("wishes_list.html", {
        "request": request,
        "grouped_wishes": grouped,
        "period": period,
        "status": status,
        "search": search,
    })


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
