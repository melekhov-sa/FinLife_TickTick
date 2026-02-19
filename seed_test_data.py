"""
Seed test data for admin@finlife.local (account_id=1).
Run:  .venv/Scripts/python.exe seed_test_data.py
"""
import sys
from decimal import Decimal
from datetime import datetime, date
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

# ── bootstrap ────────────────────────────────────────────────────
from app.infrastructure.db.session import get_session_factory
from app.infrastructure.db.models import (
    User, WalletBalance, CategoryInfo, BudgetVariant, GoalInfo,
)

db = get_session_factory()()
ACCOUNT_ID = 1

user = db.get(User, ACCOUNT_ID)
if not user:
    print("User id=1 not found"); sys.exit(1)

# ── use cases ────────────────────────────────────────────────────
from app.application.categories import CreateCategoryUseCase
from app.application.wallets import CreateWalletUseCase
from app.application.transactions import CreateTransactionUseCase
from app.application.goals import CreateGoalUseCase
from app.application.budget import (
    CreateBudgetVariantUseCase, EnsureBudgetMonthUseCase,
    SaveBudgetPlanUseCase, SaveGoalPlansUseCase,
)

def dt(y, m, d, h=12):
    return datetime(y, m, d, h, 0, 0, tzinfo=MSK)

# ═══════════════════════════════════════════════════════════════
# Phase 1: Categories, Wallets, Goals, Transactions
# ═══════════════════════════════════════════════════════════════
existing_wallets = db.query(WalletBalance).filter_by(account_id=ACCOUNT_ID).count()

if existing_wallets > 0:
    print(f"Base data exists ({existing_wallets} wallets). Loading IDs from DB...")

    # Load category IDs by title
    cats = {c.title: c.category_id for c in db.query(CategoryInfo).filter_by(account_id=ACCOUNT_ID).all()}
    inc_salary = cats["Зарплата"]
    inc_freelance = cats["Фриланс"]
    inc_cashback = cats["Кешбэк"]
    inc_gifts = cats.get("Подарки (доход)")

    exp_food = cats["Продукты"]
    exp_cafe = cats["Кафе и рестораны"]
    exp_transport = cats["Транспорт"]
    exp_housing = cats["Жильё"]
    exp_utilities = cats["Коммуналка"]
    exp_health = cats["Здоровье"]
    exp_clothes = cats["Одежда"]
    exp_entertainment = cats["Развлечения"]
    exp_subscriptions = cats["Подписки"]
    exp_education = cats["Образование"]
    exp_gifts_out = cats["Подарки (расход)"]
    exp_other = cats["Прочее"]

    # Load wallet IDs by title
    wallets = {w.title: w.wallet_id for w in db.query(WalletBalance).filter_by(account_id=ACCOUNT_ID).all()}
    w_main = wallets["Основная карта"]
    w_cash = wallets["Наличные"]
    w_credit = wallets["Кредитка Тинькофф"]
    w_savings = wallets["Накопления"]
    w_usd = wallets["USD счёт"]

    # Load goal IDs by title
    goals = {g.title: g.goal_id for g in db.query(GoalInfo).filter_by(account_id=ACCOUNT_ID).all()}
    goal_vacation = goals.get("Отпуск 2026")
    goal_emergency = goals.get("Подушка безопасности")
    goal_laptop = goals.get("Новый ноутбук")

else:
    # ── Create everything from scratch ──
    cat_uc = CreateCategoryUseCase(db)
    wallet_uc = CreateWalletUseCase(db)
    tx_uc = CreateTransactionUseCase(db)
    goal_uc = CreateGoalUseCase(db)

    print("Creating categories...")
    inc_salary = cat_uc.execute(ACCOUNT_ID, "Зарплата", "INCOME")
    inc_freelance = cat_uc.execute(ACCOUNT_ID, "Фриланс", "INCOME")
    inc_cashback = cat_uc.execute(ACCOUNT_ID, "Кешбэк", "INCOME")
    inc_gifts = cat_uc.execute(ACCOUNT_ID, "Подарки (доход)", "INCOME")

    exp_food = cat_uc.execute(ACCOUNT_ID, "Продукты", "EXPENSE")
    exp_cafe = cat_uc.execute(ACCOUNT_ID, "Кафе и рестораны", "EXPENSE")
    exp_transport = cat_uc.execute(ACCOUNT_ID, "Транспорт", "EXPENSE")
    exp_housing = cat_uc.execute(ACCOUNT_ID, "Жильё", "EXPENSE")
    exp_utilities = cat_uc.execute(ACCOUNT_ID, "Коммуналка", "EXPENSE")
    exp_health = cat_uc.execute(ACCOUNT_ID, "Здоровье", "EXPENSE")
    exp_clothes = cat_uc.execute(ACCOUNT_ID, "Одежда", "EXPENSE")
    exp_entertainment = cat_uc.execute(ACCOUNT_ID, "Развлечения", "EXPENSE")
    exp_subscriptions = cat_uc.execute(ACCOUNT_ID, "Подписки", "EXPENSE")
    exp_education = cat_uc.execute(ACCOUNT_ID, "Образование", "EXPENSE")
    exp_gifts_out = cat_uc.execute(ACCOUNT_ID, "Подарки (расход)", "EXPENSE")
    exp_other = cat_uc.execute(ACCOUNT_ID, "Прочее", "EXPENSE")
    print("  16 categories created")

    print("Creating wallets...")
    w_main = wallet_uc.execute(ACCOUNT_ID, "Основная карта", "RUB", "REGULAR", "45000")
    w_cash = wallet_uc.execute(ACCOUNT_ID, "Наличные", "RUB", "REGULAR", "5000")
    w_credit = wallet_uc.execute(ACCOUNT_ID, "Кредитка Тинькофф", "RUB", "CREDIT", "-12000")
    w_savings = wallet_uc.execute(ACCOUNT_ID, "Накопления", "RUB", "SAVINGS", "80000")
    w_usd = wallet_uc.execute(ACCOUNT_ID, "USD счёт", "USD", "REGULAR", "500")
    print("  5 wallets created")

    print("Creating goals...")
    goal_vacation = goal_uc.execute(ACCOUNT_ID, "Отпуск 2026", "RUB", "150000")
    goal_emergency = goal_uc.execute(ACCOUNT_ID, "Подушка безопасности", "RUB", "500000")
    goal_laptop = goal_uc.execute(ACCOUNT_ID, "Новый ноутбук", "RUB", "120000")
    print("  3 goals created")

    # ── Transactions ──
    print("Creating transactions...")
    tx_count = 0

    # ── December 2025 ──
    dec = 2025, 12
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("120000"), "RUB", inc_salary, "Зарплата декабрь", dt(*dec, 5)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("30000"), "RUB", inc_salary, "Аванс декабрь", dt(*dec, 20)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("25000"), "RUB", inc_freelance, "Проект верстка", dt(*dec, 15)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("1200"), "RUB", inc_cashback, "Кешбэк за ноябрь", dt(*dec, 3)); tx_count += 1

    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("18000"), "RUB", exp_food, "Продукты за месяц", dt(*dec, 8)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("5500"), "RUB", exp_cafe, "Кафе, бары", dt(*dec, 12)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("3200"), "RUB", exp_transport, "Метро + такси", dt(*dec, 10)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("35000"), "RUB", exp_housing, "Аренда квартиры", dt(*dec, 1)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("6500"), "RUB", exp_utilities, "ЖКХ декабрь", dt(*dec, 15)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("3000"), "RUB", exp_health, "Стоматолог", dt(*dec, 18)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("8000"), "RUB", exp_clothes, "Зимняя куртка", dt(*dec, 22)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("4500"), "RUB", exp_entertainment, "Кино + концерт", dt(*dec, 25)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("1990"), "RUB", exp_subscriptions, "Яндекс Плюс + VPN", dt(*dec, 5)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("15000"), "RUB", exp_gifts_out, "Подарки НГ", dt(*dec, 28)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_cash, Decimal("2500"), "RUB", exp_food, "Рынок", dt(*dec, 14)); tx_count += 1

    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("20000"), "RUB", "На отпуск", dt(*dec, 6), to_goal_id=goal_vacation); tx_count += 1
    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("10000"), "RUB", "В подушку", dt(*dec, 6), to_goal_id=goal_emergency); tx_count += 1

    # ── January 2026 ──
    jan = 2026, 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("120000"), "RUB", inc_salary, "Зарплата январь", dt(*jan, 10)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("30000"), "RUB", inc_salary, "Аванс январь", dt(*jan, 25)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("15000"), "RUB", inc_freelance, "Правки по проекту", dt(*jan, 20)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("800"), "RUB", inc_cashback, "Кешбэк за декабрь", dt(*jan, 5)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("5000"), "RUB", inc_gifts, "Подарок на НГ деньгами", dt(*jan, 2)); tx_count += 1

    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("20000"), "RUB", exp_food, "Продукты январь", dt(*jan, 12)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("7000"), "RUB", exp_cafe, "Рестораны январь", dt(*jan, 15)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("2800"), "RUB", exp_transport, "Проезд январь", dt(*jan, 10)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("35000"), "RUB", exp_housing, "Аренда квартиры", dt(*jan, 1)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("7200"), "RUB", exp_utilities, "ЖКХ январь", dt(*jan, 18)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("2000"), "RUB", exp_health, "Аптека", dt(*jan, 8)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("6000"), "RUB", exp_entertainment, "Боулинг + бар", dt(*jan, 22)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("1990"), "RUB", exp_subscriptions, "Подписки", dt(*jan, 5)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("4500"), "RUB", exp_education, "Курс Python", dt(*jan, 14)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("3000"), "RUB", exp_other, "Разное", dt(*jan, 28)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_cash, Decimal("1500"), "RUB", exp_food, "Рынок январь", dt(*jan, 20)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_credit, Decimal("9000"), "RUB", exp_clothes, "Обувь зимняя", dt(*jan, 16)); tx_count += 1

    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("15000"), "RUB", "На отпуск", dt(*jan, 11), to_goal_id=goal_vacation); tx_count += 1
    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("10000"), "RUB", "В подушку", dt(*jan, 11), to_goal_id=goal_emergency); tx_count += 1
    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("5000"), "RUB", "На ноутбук", dt(*jan, 11), to_goal_id=goal_laptop); tx_count += 1
    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_credit, Decimal("9000"), "RUB", "Погашение кредитки", dt(*jan, 27)); tx_count += 1

    # ── February 2026 (current month — partial) ──
    feb = 2026, 2
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("120000"), "RUB", inc_salary, "Зарплата февраль", dt(*feb, 5)); tx_count += 1
    tx_uc.execute_income(ACCOUNT_ID, w_main, Decimal("1100"), "RUB", inc_cashback, "Кешбэк за январь", dt(*feb, 3)); tx_count += 1

    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("12000"), "RUB", exp_food, "Продукты февр (часть)", dt(*feb, 7)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("3500"), "RUB", exp_cafe, "Кафе", dt(*feb, 9)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("1800"), "RUB", exp_transport, "Метро", dt(*feb, 4)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("35000"), "RUB", exp_housing, "Аренда квартиры", dt(*feb, 1)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("6800"), "RUB", exp_utilities, "ЖКХ февраль", dt(*feb, 12)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("1990"), "RUB", exp_subscriptions, "Подписки", dt(*feb, 5)); tx_count += 1
    tx_uc.execute_expense(ACCOUNT_ID, w_main, Decimal("4500"), "RUB", exp_education, "Курс Python продление", dt(*feb, 10)); tx_count += 1

    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("20000"), "RUB", "На отпуск", dt(*feb, 6), to_goal_id=goal_vacation); tx_count += 1
    tx_uc.execute_transfer(ACCOUNT_ID, w_main, w_savings, Decimal("10000"), "RUB", "В подушку", dt(*feb, 6), to_goal_id=goal_emergency); tx_count += 1

    print(f"  {tx_count} transactions created")


# ═══════════════════════════════════════════════════════════════
# Phase 2: Budget variant + plans
# ═══════════════════════════════════════════════════════════════
existing_variants = db.query(BudgetVariant).filter_by(account_id=ACCOUNT_ID).count()

if existing_variants > 0:
    print(f"Budget variant already exists. Skipping.")
else:
    print("Creating budget variant and plans...")

    variant = CreateBudgetVariantUseCase(db).execute(
        account_id=ACCOUNT_ID, name="Основной бюджет", base_granularity="MONTH"
    )
    db.commit()
    variant_id = variant.id

    plan_lines = [
        {"category_id": inc_salary, "kind": "INCOME", "plan_amount": "150000"},
        {"category_id": inc_freelance, "kind": "INCOME", "plan_amount": "20000"},
        {"category_id": inc_cashback, "kind": "INCOME", "plan_amount": "1000"},
        {"category_id": exp_food, "kind": "EXPENSE", "plan_amount": "22000"},
        {"category_id": exp_cafe, "kind": "EXPENSE", "plan_amount": "5000"},
        {"category_id": exp_transport, "kind": "EXPENSE", "plan_amount": "3500"},
        {"category_id": exp_housing, "kind": "EXPENSE", "plan_amount": "35000"},
        {"category_id": exp_utilities, "kind": "EXPENSE", "plan_amount": "7000"},
        {"category_id": exp_health, "kind": "EXPENSE", "plan_amount": "3000"},
        {"category_id": exp_clothes, "kind": "EXPENSE", "plan_amount": "5000"},
        {"category_id": exp_entertainment, "kind": "EXPENSE", "plan_amount": "5000"},
        {"category_id": exp_subscriptions, "kind": "EXPENSE", "plan_amount": "2000"},
        {"category_id": exp_education, "kind": "EXPENSE", "plan_amount": "5000"},
        {"category_id": exp_gifts_out, "kind": "EXPENSE", "plan_amount": "3000"},
        {"category_id": exp_other, "kind": "EXPENSE", "plan_amount": "3000"},
    ]

    for year, month in [(2025, 12), (2026, 1), (2026, 2)]:
        EnsureBudgetMonthUseCase(db).execute(ACCOUNT_ID, year, month, budget_variant_id=variant_id)
        SaveBudgetPlanUseCase(db).execute(
            account_id=ACCOUNT_ID, year=year, month=month,
            lines=plan_lines, actor_user_id=ACCOUNT_ID,
            budget_variant_id=variant_id,
        )

    goal_plans = [
        {"goal_id": goal_vacation, "plan_amount": "20000"},
        {"goal_id": goal_emergency, "plan_amount": "10000"},
        {"goal_id": goal_laptop, "plan_amount": "5000"},
    ]
    for year, month in [(2025, 12), (2026, 1), (2026, 2)]:
        SaveGoalPlansUseCase(db).execute(
            account_id=ACCOUNT_ID, year=year, month=month,
            goal_plans=goal_plans, actor_user_id=ACCOUNT_ID,
            budget_variant_id=variant_id,
        )

    print(f"  Budget variant id={variant_id}, plans for Dec 2025 / Jan 2026 / Feb 2026")

# ═══════════════════════════════════════════════════════════════
db.close()
print("\nDone! Login: admin@finlife.local / admin123")
