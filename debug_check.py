"""Debug: test dashboard + events rendering for user 2"""
import traceback
from datetime import date, datetime, timedelta
from decimal import Decimal
from sqlalchemy import func
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.db.models import (
    WalletBalance, TransactionFeed, TaskModel, TaskOccurrence,
    HabitModel, HabitOccurrence, OperationOccurrence, OperationTemplateModel,
    TaskTemplateModel, CalendarEventModel, EventOccurrenceModel, WorkCategory,
    EventFilterPresetModel, User,
)
from app.application.occurrence_generator import OccurrenceGenerator
from app.application.categories import EnsureSystemCategoriesUseCase
from app.application.events import get_7days_events, get_today_events
from app.application.habits import (
    get_today_habits, get_habits_analytics, get_habits_grid,
    get_global_heatmap, get_recent_milestones,
)
from jinja2 import Environment, FileSystemLoader

db = get_session_factory()()
env = Environment(loader=FileSystemLoader("c:/Projects/FinLife_TickTick/templates"))
user_id = 2
today = date.today()
now = datetime.now()

print(f"=== Debug for user {user_id}, today={today} ===\n")

try:
    OccurrenceGenerator(db).generate_all(user_id)
    print("1. generate_all: OK")
except Exception:
    print("1. generate_all: FAIL"); traceback.print_exc()

try:
    EnsureSystemCategoriesUseCase(db).execute(account_id=user_id, actor_user_id=user_id)
    print("2. EnsureSystemCategories: OK")
except Exception:
    print("2. FAIL"); traceback.print_exc()

wallets = db.query(WalletBalance).filter(WalletBalance.account_id == user_id, WalletBalance.is_archived == False).all()
print(f"3. Wallets: {len(wallets)}")

today_habit_occs = db.query(HabitOccurrence).filter(HabitOccurrence.account_id == user_id, HabitOccurrence.scheduled_date == today).all()
habit_map = {}
if today_habit_occs:
    for h in db.query(HabitModel).filter(HabitModel.habit_id.in_({o.habit_id for o in today_habit_occs}), HabitModel.is_archived == False).all():
        habit_map[h.habit_id] = h
print(f"4. HabitOccs: {len(today_habit_occs)}, map: {len(habit_map)}")

events_7d = get_7days_events(db, user_id, today)
event_map = {}
if events_7d:
    for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_({o.event_id for o in events_7d})).all():
        event_map[ev.event_id] = ev
wc_map = {}
if event_map:
    wc_ids = {ev.category_id for ev in event_map.values() if ev.category_id}
    if wc_ids:
        for wc in db.query(WorkCategory).filter(WorkCategory.category_id.in_(wc_ids)).all():
            wc_map[wc.category_id] = wc
print(f"5. Events7d: {len(events_7d)}, map: {len(event_map)}")

# Dashboard render
print("\n=== dashboard.html ===")
try:
    thirty_days_ago = now - timedelta(days=30)
    wallet_types = {w.wallet_id: w.wallet_type for w in wallets}
    recent_txs = db.query(TransactionFeed).filter(TransactionFeed.account_id == user_id, TransactionFeed.occurred_at >= thirty_days_ago).all()
    regular_balance = sum(w.balance for w in wallets if w.wallet_type == "REGULAR")
    savings_balance = sum(w.balance for w in wallets if w.wallet_type == "SAVINGS")
    credit_balance = sum(w.balance for w in wallets if w.wallet_type == "CREDIT")
    wallet_changes = {}
    for tx in recent_txs:
        if tx.operation_type == "INCOME" and tx.wallet_id:
            wallet_changes[tx.wallet_id] = wallet_changes.get(tx.wallet_id, Decimal("0")) + tx.amount
        elif tx.operation_type == "EXPENSE" and tx.wallet_id:
            wallet_changes[tx.wallet_id] = wallet_changes.get(tx.wallet_id, Decimal("0")) - tx.amount
    change_regular = sum(amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "REGULAR")
    change_savings = sum(amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "SAVINGS")
    change_credit = sum(amt for wid, amt in wallet_changes.items() if wallet_types.get(wid) == "CREDIT")
    month_start = datetime(now.year, now.month, 1)
    month_end = datetime(now.year + 1, 1, 1) if now.month == 12 else datetime(now.year, now.month + 1, 1)
    income_m = db.query(func.sum(TransactionFeed.amount)).filter(TransactionFeed.account_id == user_id, TransactionFeed.operation_type == "INCOME", TransactionFeed.occurred_at >= month_start, TransactionFeed.occurred_at < month_end).scalar() or Decimal("0")
    expense_m = db.query(func.sum(TransactionFeed.amount)).filter(TransactionFeed.account_id == user_id, TransactionFeed.operation_type == "EXPENSE", TransactionFeed.occurred_at >= month_start, TransactionFeed.occurred_at < month_end).scalar() or Decimal("0")
    transactions = db.query(TransactionFeed).filter(TransactionFeed.account_id == user_id).order_by(TransactionFeed.occurred_at.desc()).limit(10).all()
    today_tasks = db.query(TaskModel).filter(TaskModel.account_id == user_id, TaskModel.status == "ACTIVE").all()
    today_task_occs = db.query(TaskOccurrence).filter(TaskOccurrence.account_id == user_id, TaskOccurrence.scheduled_date == today).all()
    today_op_occs = db.query(OperationOccurrence).filter(OperationOccurrence.account_id == user_id, OperationOccurrence.scheduled_date <= today, OperationOccurrence.status == "ACTIVE").all()
    month_names = {1:"Январь",2:"Февраль",3:"Март",4:"Апрель",5:"Май",6:"Июнь",7:"Июль",8:"Август",9:"Сентябрь",10:"Октябрь",11:"Ноябрь",12:"Декабрь"}

    t = env.get_template("dashboard.html")
    result = t.render(
        request=type("R", (), {"url": type("U", (), {"path": "/"})()})(),
        wallets=wallets, transactions=transactions,
        regular_balance=regular_balance, savings_balance=savings_balance,
        credit_balance=credit_balance, financial_result_total=regular_balance + savings_balance + credit_balance,
        change_regular=change_regular, change_savings=change_savings,
        change_credit=change_credit, change_total=change_regular + change_savings + change_credit,
        income_this_month=income_m, expense_this_month=expense_m,
        month_result=income_m - expense_m, current_month=f"{month_names[now.month]} {now.year}",
        today=today, today_tasks=today_tasks, today_task_occs=today_task_occs, task_tmpl_map={},
        today_habit_occs=today_habit_occs, habit_map=habit_map,
        today_op_occs=today_op_occs, op_tmpl_map={},
        events_7d=events_7d, event_map=event_map, wc_map=wc_map,
    )
    print(f"OK ({len(result)} bytes)")
except Exception:
    print("FAIL"); traceback.print_exc()

# Events render
print("\n=== events.html ===")
try:
    today_events = get_today_events(db, user_id, today)
    week_events = get_7days_events(db, user_id, today)
    ev_ids = {o.event_id for o in today_events} | {o.event_id for o in week_events}
    ev_map2 = {}
    if ev_ids:
        for ev in db.query(CalendarEventModel).filter(CalendarEventModel.event_id.in_(ev_ids)).all():
            ev_map2[ev.event_id] = ev
    active_events = db.query(CalendarEventModel).filter(CalendarEventModel.account_id == user_id, CalendarEventModel.is_active == True).order_by(CalendarEventModel.title).all()
    work_categories = db.query(WorkCategory).filter(WorkCategory.account_id == user_id, WorkCategory.is_archived == False).order_by(WorkCategory.title).all()
    wc_map2 = {wc.category_id: wc for wc in work_categories}
    presets = db.query(EventFilterPresetModel).filter(EventFilterPresetModel.account_id == user_id).order_by(EventFilterPresetModel.name).all()

    t2 = env.get_template("events.html")
    result2 = t2.render(
        request=type("R", (), {"url": type("U", (), {"path": "/events"})()})(),
        today=today, today_events=today_events, week_events=week_events,
        event_map=ev_map2, active_events=active_events,
        work_categories=work_categories, wc_map=wc_map2, presets=presets,
    )
    print(f"OK ({len(result2)} bytes)")
except Exception:
    print("FAIL"); traceback.print_exc()

db.close()
