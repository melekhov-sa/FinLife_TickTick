"use client";

import { useMemo } from "react";
import { CalendarDayCell, type PlanEntry } from "./CalendarDayCell";

interface HolidayInfo {
  name: string;
  icon: string;
  theme: string;
}

interface DayGroup {
  date: string | null;
  date_label: string;
  is_today: boolean;
  is_overdue_group: boolean;
  day_type?: string;
  holiday?: HolidayInfo | null;
  entries: PlanEntry[];
}

interface PlanData {
  tab: string;
  range_days: number;
  today: string;
  day_groups: DayGroup[];
  done_today: PlanEntry[];
  // summary is opaque to the calendar — allow any shape
  summary: unknown;
  today_progress: { total: number; done: number; left: number };
}

interface CalendarMonthViewProps {
  monthStart: Date;
  data: PlanData;
  onDayClick: (date: string) => void;
  onEntryClick: (entry: PlanEntry) => void;
}

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Get the Monday of the week that contains the given date. */
function getMondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Returns ISO date string YYYY-MM-DD for a Date in local time. */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Build 42-cell grid (6 rows × 7 cols) for a given month. */
function buildCalendarGrid(monthStart: Date): Date[] {
  // First day of month
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  // Monday of that week
  const gridStart = getMondayOfWeek(first);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export function CalendarMonthView({
  monthStart,
  data,
  onDayClick,
  onEntryClick,
}: CalendarMonthViewProps) {
  const cells = useMemo(() => buildCalendarGrid(monthStart), [monthStart]);

  // Build lookup: dateISO → DayGroup (excluding overdue group)
  const groupByDate = useMemo(() => {
    const map = new Map<string, DayGroup>();
    for (const g of data.day_groups) {
      if (g.date && !g.is_overdue_group) {
        map.set(g.date, g);
      }
    }
    return map;
  }, [data.day_groups]);

  const todayISO = data.today;
  const currentMonth = monthStart.getMonth();

  return (
    <div className="w-full select-none">
      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-px">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-[10px] md:text-[11px] font-semibold uppercase tracking-wide py-1 ${
              i >= 5 ? "text-rose-400 dark:text-rose-400/70" : "text-slate-400 dark:text-white/40"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid: thin lines via gap-px on slate background */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-white/[0.08] border border-slate-200 dark:border-white/[0.08] rounded-lg overflow-hidden">
        {cells.map((cellDate) => {
          const iso = toISO(cellDate);
          const isCurrentMonth = cellDate.getMonth() === currentMonth;
          const isToday = iso === todayISO;
          const group = groupByDate.get(iso) ?? null;

          return (
            <CalendarDayCell
              key={iso}
              dateISO={iso}
              isCurrentMonth={isCurrentMonth}
              isToday={isToday}
              group={group}
              onDayClick={onDayClick}
              onEntryClick={onEntryClick}
            />
          );
        })}
      </div>
    </div>
  );
}
