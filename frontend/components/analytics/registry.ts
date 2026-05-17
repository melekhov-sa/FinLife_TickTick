import type { WidgetDef } from "./types";
import { PlaceholderWidget } from "./widgets/PlaceholderWidget";
import { NetWorthWidget } from "./widgets/NetWorthWidget";
import { TasksTodayWidget } from "./widgets/TasksTodayWidget";
import { HabitsCompletionWidget } from "./widgets/HabitsCompletionWidget";
import { BalanceOverviewWidget } from "./widgets/BalanceOverviewWidget";
import { SpendingChartWidget } from "./widgets/SpendingChartWidget";
import { IncomeTrendWidget } from "./widgets/IncomeTrendWidget";

export const WIDGET_REGISTRY: WidgetDef[] = [
  // ── Обзор ────────────────────────────────────────────────────────────────
  {
    id: "kpi-today",
    title: "Сегодня",
    description: "Задачи, привычки и баланс за сегодня одним взглядом",
    category: "overview",
    defaultSize: "xl",
    allowedSizes: ["xl"],
    component: PlaceholderWidget,
    emoji: "☀️",
  },

  // ── Финансы ───────────────────────────────────────────────────────────────
  {
    id: "balance-overview",
    title: "Баланс",
    description: "Доходы, расходы и остаток за месяц",
    category: "finance",
    defaultSize: "md",
    allowedSizes: ["md", "xl"],
    component: BalanceOverviewWidget,
    emoji: "💰",
  },
  {
  {
    id: "spending-chart",
    title: "Расходы по категориям",
    description: "Диаграмма трат за текущий месяц",
    category: "finance",
    defaultSize: "lg",
    allowedSizes: ["md", "lg", "xl"],
    component: SpendingChartWidget,
    emoji: "📊",
  },
  {
    id: "income-expense-trend",
    title: "Доходы и расходы",
    description: "Столбчатый график за последние 6 месяцев",
    category: "finance",
    defaultSize: "xl",
    allowedSizes: ["lg", "xl"],
    component: IncomeTrendWidget,
    emoji: "📈",
  },
  {
    id: "net-worth",
    title: "Чистый капитал",
    description: "Сумма по всем кошелькам",
    category: "finance",
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    component: NetWorthWidget,
    emoji: "🏦",
  },
  {
    id: "subscriptions-cost",
    title: "Подписки",
    description: "Суммарные расходы на подписки в месяц",
    category: "finance",
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    component: PlaceholderWidget,
    emoji: "🔄",
  },

  // ── Задачи ────────────────────────────────────────────────────────────────
  {
    id: "tasks-today",
    title: "Задачи сегодня",
    description: "Выполненные и оставшиеся задачи на сегодня",
    category: "tasks",
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    component: TasksTodayWidget,
    emoji: "✅",
  },
  {
    id: "tasks-week",
    title: "Задачи за неделю",
    description: "Прогресс выполнения задач по дням",
    category: "tasks",
    defaultSize: "md",
    allowedSizes: ["md", "lg", "xl"],
    component: PlaceholderWidget,
    emoji: "📋",
  },
  {
    id: "tasks-overdue",
    title: "Просроченные",
    description: "Количество просроченных задач",
    category: "tasks",
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    component: PlaceholderWidget,
    emoji: "⚠️",
  },

  // ── Привычки ─────────────────────────────────────────────────────────────
  {
    id: "habits-streaks",
    title: "Стрики привычек",
    description: "Текущие серии выполнения привычек",
    category: "habits",
    defaultSize: "md",
    allowedSizes: ["sm", "md", "lg"],
    component: PlaceholderWidget,
    emoji: "🔥",
  },
  {
    id: "habits-completion",
    title: "Выполнение привычек",
    description: "Процент выполнения за сегодня",
    category: "habits",
    defaultSize: "sm",
    allowedSizes: ["sm", "md"],
    component: HabitsCompletionWidget,
    emoji: "💪",
  },
  {
    id: "habits-heatmap",
    title: "Карта привычек",
    description: "Тепловая карта выполнения за месяц",
    category: "habits",
    defaultSize: "lg",
    allowedSizes: ["lg", "xl"],
    component: PlaceholderWidget,
    emoji: "🗓️",
  },

  // ── Цели ─────────────────────────────────────────────────────────────────
  {
    id: "goals-progress",
    title: "Цели",
    description: "Активные цели и процент выполнения",
    category: "goals",
    defaultSize: "md",
    allowedSizes: ["md", "lg"],
    component: PlaceholderWidget,
    emoji: "🎯",
  },
];

export function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id);
}
