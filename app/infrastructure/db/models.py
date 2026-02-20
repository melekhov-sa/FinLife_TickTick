"""
SQLAlchemy ORM models (domain tables + readmodels)
"""
from decimal import Decimal
from datetime import date as date_type, time as time_type
from sqlalchemy import String, DateTime, Integer, SmallInteger, Text, TIMESTAMP, Date, Time, func, Boolean, Numeric, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB

from app.infrastructure.db.session import Base


class User(Base):
    """
    User model (existing)
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[DateTime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    last_seen_at: Mapped[DateTime | None] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # UI theme: "{name}-{mode}", e.g. "graphite-emerald-light"
    theme: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Budget view preferences persisted across sessions
    budget_grain: Mapped[str | None] = mapped_column(String(10), nullable=True)
    budget_range_count: Mapped[int | None] = mapped_column(Integer, nullable=True)


class EventLog(Base):
    """
    Event log - source of truth для Event Sourcing

    Все изменения в системе записываются как события (неизменяемые)
    """
    __tablename__ = "event_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    actor_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)  # PostgreSQL JSONB

    occurred_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        index=True
    )
    idempotency_key: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True
    )
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )


# ============================================================================
# Read Models (projections built from events)
# ============================================================================


class ProjectorCheckpoint(Base):
    """
    Infrastructure: Track projector progress for idempotent event processing
    """
    __tablename__ = "projector_checkpoints"

    id: Mapped[int] = mapped_column(primary_key=True)
    projector_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    last_event_id: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint('projector_name', 'account_id', name='uq_projector_account'),
    )


class WalletBalance(Base):
    """
    Read model: Current wallet balances (built by WalletBalancesProjector)
    """
    __tablename__ = "wallet_balances"

    wallet_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="RUB")
    wallet_type: Mapped[str] = mapped_column(String(32), nullable=False, server_default="REGULAR")  # REGULAR, CREDIT, SAVINGS
    balance: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2),
        nullable=False,
        server_default="0"
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    folder_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Dynamics fields for wallets list
    balance_30d_ago: Mapped[Decimal | None] = mapped_column(Numeric(precision=20, scale=2), nullable=True)
    operations_count_30d: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_operation_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


class WalletFolder(Base):
    """Simple organisational folders for grouping wallets (plain CRUD, not event-sourced)."""
    __tablename__ = "wallet_folders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    wallet_type: Mapped[str] = mapped_column(String(32), nullable=False)  # REGULAR, CREDIT, SAVINGS
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class CategoryInfo(Base):
    """
    Read model: Category information (built by CategoriesProjector)
    """
    __tablename__ = "categories"

    category_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category_type: Mapped[str] = mapped_column(String(20), nullable=False)  # INCOME/EXPENSE
    parent_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[DateTime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


class TransactionFeed(Base):
    """
    Read model: Transaction feed for listing (built by TransactionsFeedProjector)
    """
    __tablename__ = "transactions_feed"

    transaction_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    operation_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=20, scale=2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # For INCOME/EXPENSE
    wallet_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # For TRANSFER
    from_wallet_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    to_wallet_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # For TRANSFER with goals (SAVINGS wallets)
    from_goal_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    to_goal_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    occurred_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        nullable=False,
        index=True
    )

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        nullable=False
    )


# ============================================================================
# Tasks, Habits & Planned Operations Read Models
# ============================================================================


class WorkCategory(Base):
    """Read model: Work categories with emoji (separate from financial categories)"""
    __tablename__ = "work_categories"

    category_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(256), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('account_id', 'title', name='uq_work_category_account_title'),
    )


class RecurrenceRuleModel(Base):
    """Read model: Recurrence rules (shared by habits, task templates, operation templates)"""
    __tablename__ = "recurrence_rules"

    rule_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    freq: Mapped[str] = mapped_column(String(32), nullable=False)  # DAILY/WEEKLY/MONTHLY/YEARLY/INTERVAL_DAYS/MULTI_DATE
    interval: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    until_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    by_weekday: Mapped[str | None] = mapped_column(String(64), nullable=True)  # "0,1,4" or "MO,TU,FR"
    by_monthday: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..31
    monthday_clip_to_last_day: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    by_month: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..12
    by_monthday_for_year: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..31
    dates_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON array of "YYYY-MM-DD"

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class TaskModel(Base):
    """Read model: One-off tasks"""
    __tablename__ = "tasks"

    task_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # DueSpec fields
    due_kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="NONE")  # NONE/DATE/DATETIME/WINDOW
    due_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)       # for DATETIME
    due_start_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)  # for WINDOW
    due_end_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)    # for WINDOW

    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ACTIVE")  # ACTIVE/DONE/ARCHIVED
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> work_categories

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    archived_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


class TaskReminderModel(Base):
    """Read model: Task reminders (offset-based, tied to task due time)"""
    __tablename__ = "task_reminders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('task_id', 'offset_minutes', name='uq_task_reminder_offset'),
    )


class UserReminderTimePreset(Base):
    """User-defined reminder time presets (e.g. 'За 15 минут', 'За 1 день')"""
    __tablename__ = "user_reminder_time_presets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(64), nullable=False)
    offset_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('account_id', 'offset_minutes', name='uq_user_reminder_preset'),
    )


class HabitModel(Base):
    """Read model: Habits with streak tracking"""
    __tablename__ = "habits"

    habit_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> recurrence_rules
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> work_categories

    active_from: Mapped[date_type] = mapped_column(Date, nullable=False)
    active_until: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    level: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="1")  # 1=simple, 2=medium, 3=hard

    current_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    done_count_30d: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class HabitOccurrence(Base):
    """Read model: Habit occurrences (generated by recurrence engine)"""
    __tablename__ = "habit_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    habit_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    scheduled_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ACTIVE")  # ACTIVE/DONE/SKIPPED
    completed_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('account_id', 'habit_id', 'scheduled_date', name='uq_habit_occurrence'),
        Index('ix_habit_occ_date', 'account_id', 'habit_id', 'scheduled_date'),
    )


class TaskTemplateModel(Base):
    """Read model: Recurring task templates"""
    __tablename__ = "task_templates"

    template_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> recurrence_rules
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> work_categories

    active_from: Mapped[date_type] = mapped_column(Date, nullable=False)
    active_until: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class TaskOccurrence(Base):
    """Read model: Task template occurrences (generated by recurrence engine)"""
    __tablename__ = "task_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    template_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    scheduled_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ACTIVE")  # ACTIVE/DONE/SKIPPED
    completed_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint('account_id', 'template_id', 'scheduled_date', name='uq_task_occurrence'),
        Index('ix_task_occ_date', 'account_id', 'template_id', 'scheduled_date'),
    )


class OperationTemplateModel(Base):
    """Read model: Planned financial operation templates"""
    __tablename__ = "operation_templates"

    template_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> recurrence_rules

    active_from: Mapped[date_type] = mapped_column(Date, nullable=False)
    active_until: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    kind: Mapped[str] = mapped_column(String(32), nullable=False)  # INCOME/EXPENSE/TRANSFER
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=20, scale=2), nullable=False)
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)

    wallet_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # for INCOME/EXPENSE/TRANSFER (source)
    destination_wallet_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # for TRANSFER only
    category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> categories (financial)
    work_category_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> work_categories

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class OperationOccurrence(Base):
    """Read model: Planned operation occurrences (generated by recurrence engine)"""
    __tablename__ = "operation_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    template_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    scheduled_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, server_default="ACTIVE")  # ACTIVE/DONE/SKIPPED
    completed_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> transactions_feed (when confirmed)

    __table_args__ = (
        UniqueConstraint('account_id', 'template_id', 'scheduled_date', name='uq_operation_occurrence'),
        Index('ix_op_occ_date', 'account_id', 'scheduled_date', 'status'),
    )


# ============================================================================
# Calendar Events Read Models
# ============================================================================

class CalendarEventModel(Base):
    """Read model: Calendar events (built by EventsProjector)"""
    __tablename__ = "events"

    event_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> work_categories
    repeat_rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> recurrence_rules
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class EventOccurrenceModel(Base):
    """Read model: Event occurrences (calendar fact instances)"""
    __tablename__ = "event_occurrences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> events

    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    start_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)  # null = all_day
    end_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)  # for period events
    end_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)

    is_cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    source: Mapped[str] = mapped_column(String(16), nullable=False, server_default="'manual'")  # 'manual' | 'rule'

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('account_id', 'event_id', 'start_date', 'source', name='uq_event_occurrence'),
        Index('ix_event_occ_date', 'account_id', 'start_date'),
    )


class EventReminderModel(Base):
    """Read model: Event reminders (per occurrence)"""
    __tablename__ = "event_reminders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    occurrence_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> event_occurrences

    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # 'ui' | 'telegram'
    mode: Mapped[str] = mapped_column(String(16), nullable=False)  # 'offset' | 'fixed_time'
    offset_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixed_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class EventDefaultReminderModel(Base):
    """Read model: Default reminders for event (copied to occurrences on generation)"""
    __tablename__ = "event_default_reminders"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> events

    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # 'ui' | 'telegram'
    mode: Mapped[str] = mapped_column(String(16), nullable=False)  # 'offset' | 'fixed_time'
    offset_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixed_time: Mapped[time_type | None] = mapped_column(Time, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class EventFilterPresetModel(Base):
    """Read model: Dashboard filter presets for events"""
    __tablename__ = "event_filter_presets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(128), nullable=False)
    category_ids_json: Mapped[str] = mapped_column(Text, nullable=False, server_default="'[]'")  # JSON array
    is_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


# ============================================================================
# Budget Read Models
# ============================================================================


class BudgetVariant(Base):
    """Read model: Budget variant — defines base granularity for budget planning"""
    __tablename__ = "budget_variants"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_granularity: Mapped[str] = mapped_column(String(16), nullable=False, server_default="MONTH")  # DAY/WEEK/MONTH/YEAR
    week_starts_on: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")  # 1=Monday (ISO)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, server_default="'Europe/Moscow'")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        Index('ix_budget_variant_account_archived', 'account_id', 'is_archived'),
    )


class BudgetMonth(Base):
    """Read model: Budget month header (built by BudgetProjector)"""
    __tablename__ = "budget_months"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    budget_variant_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # -> budget_variants

    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..12
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('account_id', 'year', 'month', name='uq_budget_month'),
    )


class BudgetLine(Base):
    """Read model: Budget plan line per category (built by BudgetProjector)"""
    __tablename__ = "budget_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    budget_month_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> budget_months
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    category_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> categories (financial)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # INCOME / EXPENSE
    plan_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2), nullable=False, server_default="0"
    )
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('budget_month_id', 'category_id', 'kind', name='uq_budget_line'),
        Index('ix_budget_line_month', 'budget_month_id'),
    )


class BudgetPlanTemplate(Base):
    """Read model: Budget plan template — default amounts for a variant"""
    __tablename__ = "budget_plan_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    budget_variant_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> budget_variants
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    category_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> categories
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # INCOME / EXPENSE
    default_planned_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2), nullable=False, server_default="0"
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('budget_variant_id', 'category_id', 'kind', name='uq_budget_plan_template'),
        Index('ix_budget_plan_template_variant', 'budget_variant_id'),
    )


class BudgetVariantHiddenCategory(Base):
    """Join table: categories hidden from a budget variant's matrix view.

    Presence of a row means the category is HIDDEN.
    Absence = visible (default: all visible).
    """
    __tablename__ = "budget_variant_hidden_categories"

    variant_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)
    category_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)

    __table_args__ = (
        Index('ix_bvhc_variant', 'variant_id'),
    )


class BudgetVariantHiddenGoal(Base):
    """Join table: goals hidden from a budget variant's matrix view.

    Presence of a row means the goal is HIDDEN.
    Absence = visible (default: all visible).
    """
    __tablename__ = "budget_variant_hidden_goals"

    variant_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)
    goal_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)

    __table_args__ = (
        Index('ix_bvhg_variant', 'variant_id'),
    )


class BudgetVariantHiddenWithdrawalGoal(Base):
    """Join table: goals hidden from the 'withdrawal' section of a budget variant's matrix view.

    Presence of a row means the goal is HIDDEN in 'Взять из отложенного'.
    Absence = visible (default: all visible).
    """
    __tablename__ = "budget_variant_hidden_withdrawal_goals"

    variant_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)
    goal_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)

    __table_args__ = (
        Index('ix_bvhwg_variant', 'variant_id'),
    )


# ============================================================================
# Subscriptions Models
# ============================================================================


class SubscriptionModel(Base):
    """Subscription tracking: links expense and income categories"""
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    expense_category_id: Mapped[int] = mapped_column(Integer, nullable=False)  # -> categories (EXPENSE)
    income_category_id: Mapped[int] = mapped_column(Integer, nullable=False)   # -> categories (INCOME)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class ContactModel(Base):
    """Global contact directory — people who participate in subscriptions"""
    __tablename__ = "contacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class WishModel(Base):
    """Read model: Wishes - long-term intentions backlog"""
    __tablename__ = "wishes"

    wish_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    wish_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # PURCHASE, EVENT, PLACE, OTHER
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # IDEA, CONSIDERING, PLANNED, DONE, CANCELED

    # Scheduling (mutually exclusive)
    target_date: Mapped[date_type | None] = mapped_column(Date, nullable=True, index=True)
    target_month: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)  # YYYY-MM format

    # Finance
    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    is_recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", index=True)
    last_completed_at: Mapped[DateTime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

    # Meta
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[DateTime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


# ============================================================================
# Goals (Savings Goals) Read Models
# ============================================================================


class GoalInfo(Base):
    """Read model: Savings goals (built by GoalsProjector)"""
    __tablename__ = "goals"

    goal_id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    target_amount: Mapped[Decimal | None] = mapped_column(Numeric(precision=20, scale=2), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[DateTime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )


class GoalWalletBalance(Base):
    """Read model: Goal x Wallet balance (built by GoalWalletBalancesProjector)"""
    __tablename__ = "goal_wallet_balances"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    goal_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    wallet_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2), nullable=False, server_default="0"
    )

    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    __table_args__ = (
        UniqueConstraint('goal_id', 'wallet_id', name='uq_goal_wallet'),
        Index('ix_goal_wallet_account', 'account_id', 'goal_id'),
    )


class BudgetGoalPlan(Base):
    """Read model: Budget savings plan per goal per month (built by BudgetProjector)"""
    __tablename__ = "budget_goal_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    budget_month_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> budget_months
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    goal_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> goals

    plan_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2), nullable=False, server_default="0"
    )
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('budget_month_id', 'goal_id', name='uq_budget_goal_plan'),
        Index('ix_budget_goal_plan_month', 'budget_month_id'),
    )


class BudgetGoalWithdrawalPlan(Base):
    """Read model: Budget withdrawal plan per goal per month ('Взять из отложенного')."""
    __tablename__ = "budget_goal_withdrawal_plans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    budget_month_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    goal_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    plan_amount: Mapped[Decimal] = mapped_column(
        Numeric(precision=20, scale=2), nullable=False, server_default="0"
    )
    note: Mapped[str | None] = mapped_column(String(512), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('budget_month_id', 'goal_id', name='uq_budget_goal_withdrawal_plan'),
        Index('ix_bgwp_month', 'budget_month_id'),
    )


class SubscriptionMemberModel(Base):
    """Link table: which contact participates in which subscription"""
    __tablename__ = "subscription_members"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    contact_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # -> contacts
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    payment_per_year: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    payment_per_month: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class SubscriptionCoverageModel(Base):
    """Coverage period: OPERATION (tied to transaction) or INITIAL (manual entry)"""
    __tablename__ = "subscription_coverages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    source_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="OPERATION", server_default="OPERATION",
    )  # OPERATION / INITIAL
    payer_type: Mapped[str] = mapped_column(String(16), nullable=False)  # SELF / MEMBER
    member_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # -> subscription_members
    transaction_id: Mapped[int | None] = mapped_column(Integer, nullable=True, unique=True)  # -> transactions_feed (NULL for INITIAL)
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type] = mapped_column(Date, nullable=False)  # inclusive

    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint('transaction_id', name='uq_coverage_transaction'),
        Index('ix_coverage_sub_payer', 'subscription_id', 'payer_type', 'member_id'),
    )


# ============================================================================
# XP / Gamification
# ============================================================================


class UserXpState(Base):
    """Read model: User XP and level state (built by XpProjector)."""
    __tablename__ = "user_xp_state"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    total_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    current_level_xp: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    xp_to_next_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default="100")
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class XpEvent(Base):
    """Read model: Individual XP award record (idempotency + history)."""
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_event_id: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    xp_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )


class UserActivityDaily(Base):
    """Read model: daily activity aggregation per user (built by ActivityProjector)."""
    __tablename__ = "user_activity_daily"

    user_id: Mapped[int] = mapped_column(Integer, nullable=False, primary_key=True)
    day_date: Mapped[date_type] = mapped_column(Date, nullable=False, primary_key=True)
    ops_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    tasks_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    habits_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    goals_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    points: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class PushSubscription(Base):
    """Web Push subscription for a user device."""
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
