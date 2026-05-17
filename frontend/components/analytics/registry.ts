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
import { SubscriptionsCostWidget } from "./widgets/SubscriptionsCostWidget";
import { KpiTodayWidget } from "./widgets/KpiTodayWidget";

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
    defaultW: 2, defaultH: 4, minW: 2, minH: 3,
    component: SpendingChartWidget,
    emoji: "📊",
  },
  {
    id: "income-expense-trend",
    title: "Доходы и расходы",
    description: "Столбчатый график за последние 6 месяцев",
    category: "finance",
    defaultW: 4, defaultH: 3, minW: 2, minH: 3,
    component: IncomeTrendWidget,
    emoji: "📈",
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
];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}
