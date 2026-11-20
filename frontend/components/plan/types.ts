/**
 * Типы и общие константы страницы «План».
 *
 * Вынесено из page.tsx, где было 1667 строк: карточки дня, строки
 * записей, меню и сама страница жили в одном файле и тянули одни и те же
 * определения. Теперь они в одном месте и видны всем частям явно.
 */

export interface PlanEntry {
  kind: string;
  id: number;
  title: string;
  date: string | null;
  time: string | null;
  is_done: boolean;
  is_overdue: boolean;
  status: string | null;
  category_emoji: string | null;
  meta: Record<string, unknown>;
}

export interface HolidayInfo {
  name: string;
  icon: string;
  theme: string;
}

export interface DayGroup {
  date: string | null;
  date_label: string;
  is_today: boolean;
  is_overdue_group: boolean;
  day_type?: string;
  holiday?: HolidayInfo | null;
  vacation?: boolean;
  entries: PlanEntry[];
}

// Federal-holiday theme → Tailwind classes for card, border and badge
export const HOLIDAY_THEME_CLS: Record<string, { bg: string; border: string; badgeBg: string; badgeText: string }> = {
  winter:    { bg: "bg-sky-50 dark:bg-sky-500/[0.07]",       border: "border-sky-300/60 dark:border-sky-500/25",       badgeBg: "bg-sky-100 dark:bg-sky-500/15",       badgeText: "text-sky-700 dark:text-sky-300" },
  christmas: { bg: "bg-amber-50 dark:bg-amber-500/[0.07]",   border: "border-amber-300/60 dark:border-amber-500/25",   badgeBg: "bg-amber-100 dark:bg-amber-500/15",   badgeText: "text-amber-700 dark:text-amber-300" },
  military:  { bg: "bg-emerald-50 dark:bg-emerald-500/[0.07]", border: "border-emerald-300/60 dark:border-emerald-500/25", badgeBg: "bg-emerald-100 dark:bg-emerald-500/15", badgeText: "text-emerald-700 dark:text-emerald-300" },
  rose:      { bg: "bg-rose-50 dark:bg-rose-500/[0.07]",     border: "border-rose-300/60 dark:border-rose-500/25",     badgeBg: "bg-rose-100 dark:bg-rose-500/15",     badgeText: "text-rose-700 dark:text-rose-300" },
  spring:    { bg: "bg-lime-50 dark:bg-lime-500/[0.07]",     border: "border-lime-300/60 dark:border-lime-500/25",     badgeBg: "bg-lime-100 dark:bg-lime-500/15",     badgeText: "text-lime-700 dark:text-lime-300" },
  victory:   { bg: "bg-orange-50 dark:bg-orange-500/[0.07]", border: "border-orange-300/60 dark:border-orange-500/25", badgeBg: "bg-orange-100 dark:bg-orange-500/15", badgeText: "text-orange-700 dark:text-orange-300" },
  tricolor:  { bg: "bg-[var(--app-accent-weak)]", border: "border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)]", badgeBg: "bg-[var(--app-accent-weak)]", badgeText: "text-[var(--app-accent-ink)]" },
  unity:     { bg: "bg-blue-50 dark:bg-blue-500/[0.07]",     border: "border-blue-300/60 dark:border-blue-500/25",     badgeBg: "bg-blue-100 dark:bg-blue-500/15",     badgeText: "text-blue-700 dark:text-blue-300" },
};

export function holidayTheme(theme: string): typeof HOLIDAY_THEME_CLS[string] {
  return HOLIDAY_THEME_CLS[theme] ?? HOLIDAY_THEME_CLS.winter;
}

export const VACATION_THEME = {
  bg: "bg-cyan-50 dark:bg-cyan-500/[0.07]",
  border: "border-cyan-300/60 dark:border-cyan-500/25",
  badgeBg: "bg-cyan-100 dark:bg-cyan-500/15",
  badgeText: "text-cyan-700 dark:text-cyan-300",
};

export interface PlanSummary {
  today_count: number;
  week_count: number;
  overdue_count: number;
  done_today_count: number;
}

export interface PlanData {
  tab: string;
  range_days: number;
  today: string;
  summary: PlanSummary;
  today_progress: { total: number; done: number; left: number };
  day_groups: DayGroup[];
  done_today: PlanEntry[];
}

export const TABS = [
  { value: "active",  label: "Активные" },
  { value: "done",    label: "Выполненные" },
] as const;

export const RANGES = [
  { value: 1,  label: "День" },
  { value: 7,  label: "Неделя" },
  { value: 14, label: "2 недели" },
  { value: 30, label: "Месяц" },
  { value: 90, label: "3 мес." },
];

export type EntryGroupType = "tasks" | "habits" | "events" | "ops";

export const ENTRY_GROUP_ORDER: EntryGroupType[] = ["tasks", "habits", "events", "ops"];
export const ENTRY_GROUP_LABELS: Record<EntryGroupType, string> = {
  tasks: "Задачи", habits: "Привычки", events: "События", ops: "Финансы",
};

export function entryGroupType(kind: string): EntryGroupType {
  if (kind === "task" || kind === "task_occ") return "tasks";
  if (kind === "habit") return "habits";
  if (kind === "event") return "events";
  return "ops";
}

/** Кольцо прогресса «сегодня»: выполнено / всего. */

export const ENTRY_GROUP_STRIPE: Record<EntryGroupType, string> = {
  tasks: "var(--app-accent)",
  habits: "#8B5CF6",
  events: "#3B82F6",
  ops: "#F59E0B",
};
