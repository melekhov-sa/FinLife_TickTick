import type { WidgetDef } from "./types";
import { HabitsHeatmapWidget } from "./widgets/HabitsHeatmapWidget";
import { NetWorthWidget } from "./widgets/NetWorthWidget";
import { TasksTodayWidget } from "./widgets/TasksTodayWidget";
import { TasksWeekWidget } from "./widgets/TasksWeekWidget";
import { TasksOverdueWidget } from "./widgets/TasksOverdueWidget";
import { HabitsCompletionWidget } from "./widgets/HabitsCompletionWidget";
import { HabitsStreaksWidget } from "./widgets/HabitsStreaksWidget";
import { BalanceOverviewWidget } from "./widgets/BalanceOverviewWidget";
import { SpendingChartWidget } from "./widgets/SpendingChartWidget";
import { IncomeTrendWidget } from "./widgets/IncomeTrendWidget";
import { GoalsProgressWidget } from "./widgets/GoalsProgressWidget";
import { GoalsSummaryWidget } from "./widgets/GoalsSummaryWidget";
import { SubscriptionsCostWidget } from "./widgets/SubscriptionsCostWidget";
import { KpiTodayWidget } from "./widgets/KpiTodayWidget";
import { BudgetOverviewWidget } from "./widgets/BudgetOverviewWidget";
import { MonthComparisonWidget } from "./widgets/MonthComparisonWidget";
import { WalletBalancesWidget } from "./widgets/WalletBalancesWidget";
import { SpendingByWeekdayWidget } from "./widgets/SpendingByWeekdayWidget";
import { PlannedOpsWidget } from "./widgets/PlannedOpsWidget";
import { WeeklyScoreWidget } from "./widgets/WeeklyScoreWidget";
import { ActivityFeedWidget } from "./widgets/ActivityFeedWidget";
import { BudgetRingsWidget } from "./widgets/BudgetRingsWidget";
import { CounterWidget } from "./widgets/CounterWidget";

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Обзор ────────────────────────────────────────────────────────────────
  {
    id: "kpi-today",
    title: "Сегодня",
    description: "Задачи, привычки и баланс за сегодня одним взглядом",
    category: "overview",
    defaultW: 4, defaultH: 2, minW: 2, minH: 2,
    component: KpiTodayWidget,
    emoji: "☀️",
  },

  // ── Финансы ───────────────────────────────────────────────────────────────
  {
    id: "net-worth",
    title: "Чистый капитал",
    description: "Сумма по всем кошелькам",
    category: "finance",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: NetWorthWidget,
    emoji: "🏦",
  },
  {
    id: "balance-overview",
    title: "Баланс",
    description: "Доходы, расходы и остаток за месяц",
    category: "finance",
    defaultW: 2, defaultH: 2, minW: 2, minH: 2,
    component: BalanceOverviewWidget,
    emoji: "💰",
  },
  {
    id: "spending-chart",
    title: "Расходы по категориям",
    description: "Диаграмма трат за текущий месяц",
    category: "finance",
    defaultW: 2, defaultH: 4, minW: 2, minH: 2,
    component: SpendingChartWidget,
    emoji: "📊",
    bodyPadded: false,
  },
  {
    id: "income-expense-trend",
    title: "Доходы и расходы",
    description: "Столбчатый график за последние 6 месяцев",
    category: "finance",
    defaultW: 4, defaultH: 3, minW: 2, minH: 2,
    component: IncomeTrendWidget,
    emoji: "📈",
    bodyPadded: false,
  },
  {
    id: "subscriptions-cost",
    title: "Подписки",
    description: "Суммарные расходы на подписки в месяц",
    category: "finance",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: SubscriptionsCostWidget,
    emoji: "🔄",
  },

  // ── Задачи ────────────────────────────────────────────────────────────────
  {
    id: "tasks-today",
    title: "Задачи сегодня",
    description: "Выполненные и оставшиеся задачи на сегодня",
    category: "tasks",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: TasksTodayWidget,
    emoji: "✅",
  },
  {
    id: "tasks-week",
    title: "Задачи за неделю",
    description: "Прогресс выполнения задач по дням",
    category: "tasks",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: TasksWeekWidget,
    emoji: "📋",
    bodyPadded: false,
  },
  {
    id: "tasks-overdue",
    title: "Просроченные",
    description: "Количество просроченных задач",
    category: "tasks",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: TasksOverdueWidget,
    emoji: "⚠️",
  },

  // ── Привычки ─────────────────────────────────────────────────────────────
  {
    id: "habits-completion",
    title: "Привычки сегодня",
    description: "Процент выполнения за сегодня",
    category: "habits",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: HabitsCompletionWidget,
    emoji: "💪",
  },
  {
    id: "habits-streaks",
    title: "Стрики привычек",
    description: "Текущие серии выполнения привычек",
    category: "habits",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: HabitsStreaksWidget,
    emoji: "🔥",
  },
  {
    id: "habits-heatmap",
    title: "Карта привычек",
    description: "Тепловая карта выполнения за месяц",
    category: "habits",
    defaultW: 4, defaultH: 4, minW: 3, minH: 3,
    component: HabitsHeatmapWidget,
    emoji: "🗓️",
  },

  // ── Цели ─────────────────────────────────────────────────────────────────
  {
    id: "goals-progress",
    title: "Цели",
    description: "Активные цели и процент выполнения",
    category: "goals",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: GoalsProgressWidget,
    emoji: "🎯",
  },
  {
    id: "goals-summary",
    title: "Сводка целей",
    description: "Средний прогресс и количество выполненных целей",
    category: "goals",
    defaultW: 1, defaultH: 2, minW: 1, minH: 2,
    component: GoalsSummaryWidget,
    emoji: "🏆",
  },

  // ── Бюджет ────────────────────────────────────────────────────────────────
  {
    id: "budget-overview",
    title: "Бюджет",
    description: "План vs факт по доходам и расходам за месяц",
    category: "finance",
    defaultW: 2, defaultH: 2, minW: 2, minH: 2,
    component: BudgetOverviewWidget,
    emoji: "📅",
  },
  {
    id: "month-comparison",
    title: "Сравнение месяцев",
    description: "Текущий vs прошлый месяц: финансы, задачи, привычки",
    category: "overview",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: MonthComparisonWidget,
    emoji: "📆",
  },
  {
    id: "wallet-balances",
    title: "Кошельки",
    description: "Суммарный баланс и тренд за 6 месяцев",
    category: "finance",
    defaultW: 2, defaultH: 3, minW: 2, minH: 3,
    component: WalletBalancesWidget,
    emoji: "💳",
    bodyPadded: false,
  },
  {
    id: "spending-by-weekday",
    title: "Траты по дням недели",
    description: "Средние расходы по дням недели",
    category: "finance",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: SpendingByWeekdayWidget,
    emoji: "📉",
    bodyPadded: false,
  },
  {
    id: "planned-ops",
    title: "Предстоящие платежи",
    description: "Ближайшие запланированные операции",
    category: "finance",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: PlannedOpsWidget,
    emoji: "🗒️",
  },

  // ── Новые виджеты ─────────────────────────────────────────────────────────
  {
    id: "weekly-score",
    title: "Эффективность недели",
    description: "Выполнение привычек и задач за 7 дней",
    category: "overview",
    defaultW: 1, defaultH: 3, minW: 1, minH: 2,
    component: WeeklyScoreWidget,
    emoji: "⚡",
  },
  {
    id: "activity-feed",
    title: "Лента активности",
    description: "Последние транзакции, задачи и привычки",
    category: "overview",
    defaultW: 2, defaultH: 4, minW: 2, minH: 3,
    component: ActivityFeedWidget,
    emoji: "📰",
  },
  {
    id: "budget-rings",
    title: "Топ расходов",
    description: "5 крупнейших категорий трат за месяц",
    category: "finance",
    defaultW: 2, defaultH: 3, minW: 2, minH: 2,
    component: BudgetRingsWidget,
    emoji: "💹",
  },

  // ── Счётчики ──────────────────────────────────────────────────────────────
  {
    id: "counter",
    title: "Счётчик",
    description: "Произвольный счётчик: ручной или автоматический по категории событий/задач",
    category: "overview",
    defaultW: 1, defaultH: 3, minW: 1, minH: 3,
    component: CounterWidget,
    emoji: "🔢",
  },
];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}
