"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { clsx } from "clsx";
import { getHolidayRU } from "@/lib/holidays";

export interface VacationSpan { start: string; end: string; }

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
  category_title?: string | null;
  meta: Record<string, unknown>;
}

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
  vacation?: boolean;
  entries: PlanEntry[];
}

interface CalendarDayCellProps {
  dateISO: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  group: DayGroup | null;
  horizonISO?: string;
  vacationSpans?: VacationSpan[];
  onDayClick: (date: string) => void;
  onEntryClick: (entry: PlanEntry) => void;
}

// Kind → icon character
function kindIcon(kind: string, emoji?: string | null): string {
  if (emoji) return emoji;
  switch (kind) {
    case "event": return "🔔";
    case "task": return "▢";
    case "task_occ": return "▢";
    case "planned_op": return "💰";
    case "habit": return "🌱";
    case "wish": return "⭐";
    default: return "•";
  }
}

// Kind → pill color classes
function kindPillCls(kind: string, isDone: boolean): string {
  if (isDone) return "bg-slate-100 dark:bg-white/[0.05] text-slate-400 dark:text-white/30";
  switch (kind) {
    case "event": return "bg-purple-50 dark:bg-purple-500/[0.12] text-purple-700 dark:text-purple-300";
    case "task":
    case "task_occ": return "bg-indigo-50 dark:bg-indigo-500/[0.12] text-indigo-700 dark:text-indigo-300";
    case "planned_op": return "bg-amber-50 dark:bg-amber-500/[0.12] text-amber-700 dark:text-amber-300";
    case "habit": return "bg-violet-50 dark:bg-violet-500/[0.12] text-violet-700 dark:text-violet-300";
    default: return "bg-slate-50 dark:bg-white/[0.06] text-slate-600 dark:text-white/60";
  }
}

const MAX_PILLS = 3;

function EntryPill({
  entry,
  onEntryClick,
}: {
  entry: PlanEntry;
  onEntryClick: (e: PlanEntry) => void;
}) {
  const canDrag = (entry.kind === "task" || entry.kind === "event" || entry.kind === "planned_op") && !entry.is_done;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${entry.kind}-${entry.id}`,
    disabled: !canDrag,
  });

  const pillCls = clsx(
    "flex items-center gap-0.5 px-1 py-px rounded text-[10px] md:text-[11px] w-full truncate transition-opacity select-none",
    kindPillCls(entry.kind, entry.is_done),
    isDragging && "opacity-30",
    entry.is_done && "line-through",
    canDrag && "cursor-grab active:cursor-grabbing",
    !canDrag && "cursor-pointer",
  );

  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? attributes : {})}
      {...(canDrag ? listeners : {})}
      className={pillCls}
      onClick={(ev) => {
        ev.stopPropagation();
        onEntryClick(entry);
      }}
      title={entry.title}
    >
      <span className="shrink-0 text-[9px] md:text-[10px]">{kindIcon(entry.kind, entry.category_emoji)}</span>
      <span className="truncate hidden sm:block">{entry.title}</span>
    </div>
  );
}

export function CalendarDayCell({
  dateISO,
  isCurrentMonth,
  isToday,
  group,
  horizonISO,
  vacationSpans,
  onDayClick,
  onEntryClick,
}: CalendarDayCellProps) {
  // Vacation: from spans prop (works for empty cells) or from the group flag
  const isVacation =
    (vacationSpans ?? []).some((s) => s.start <= dateISO && dateISO <= s.end) ||
    group?.vacation === true;
  // Holiday: computed from static lookup (works for empty cells)
  const cellHoliday = getHolidayRU(dateISO);

  const allEntries = group?.entries ?? [];
  // Hide the "Отпуск" event pill — the cell background already communicates it
  const entries = isVacation
    ? allEntries.filter(
        (e) => !(e.kind === "event" && e.category_title?.toLowerCase() === "отпуск"),
      )
    : allEntries;
  const visibleEntries = entries.slice(0, MAX_PILLS);
  const overflowCount = entries.length - MAX_PILLS;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `date-${dateISO}`,
  });

  const dayNum = parseInt(dateISO.split("-")[2], 10);
  const isWeekend = group?.day_type === "weekend" || group?.day_type === "holiday";
  const beyondHorizon = !!horizonISO && dateISO > horizonISO;
  const isHoliday = !!cellHoliday;

  return (
    <div
      ref={setDropRef}
      className={clsx(
        "relative flex flex-col min-h-[72px] md:min-h-[100px] p-0.5 md:p-1 cursor-pointer transition-colors",
        "bg-white dark:bg-[#0f1221]",
        isOver && "ring-2 ring-inset ring-indigo-400/60 bg-indigo-50/40 dark:bg-indigo-500/[0.07]",
        isToday && !isOver && "ring-2 ring-inset ring-indigo-400/50",
        isVacation && !isOver && "bg-cyan-50/60 dark:bg-cyan-500/[0.07]",
        isHoliday && !isVacation && !isToday && !isOver && "bg-red-50/50 dark:bg-red-500/[0.05]",
        isWeekend && !isVacation && !isHoliday && !isToday && !isOver && "bg-slate-50/80 dark:bg-white/[0.02]",
        !isCurrentMonth && "opacity-40",
      )}
      onClick={() => onDayClick(dateISO)}
    >
      {beyondHorizon && isCurrentMonth && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "rgba(148,163,184,0.07)" }}
        />
      )}
      {/* Day number + holiday/vacation icons */}
      <div className="flex items-start justify-between mb-0.5">
        <span
          className={clsx(
            "text-[11px] md:text-[12px] font-semibold leading-none px-0.5",
            isToday
              ? "text-indigo-600 dark:text-indigo-400"
              : isVacation
              ? "text-cyan-600 dark:text-cyan-400"
              : isWeekend
              ? "text-rose-500 dark:text-rose-400/80"
              : "text-slate-600 dark:text-white/60",
          )}
        >
          {dayNum}
        </span>
        <div className="flex items-center gap-0.5">
          {isVacation && (
            <span className="text-[10px] leading-none" title="Отпуск">
              🏖️
            </span>
          )}
          {cellHoliday && (
            <span className="text-[10px] leading-none" title={cellHoliday.name}>
              {cellHoliday.icon}
            </span>
          )}
        </div>
      </div>

      {/* Entry pills */}
      <div className="flex flex-col gap-px flex-1">
        {visibleEntries.map((entry) => (
          <EntryPill key={`${entry.kind}-${entry.id}`} entry={entry} onEntryClick={onEntryClick} />
        ))}
        {overflowCount > 0 && (
          <button
            className="text-left text-[9px] md:text-[10px] text-indigo-500 dark:text-indigo-400/70 font-medium px-1 hover:underline truncate"
            onClick={(ev) => {
              ev.stopPropagation();
              onDayClick(dateISO);
            }}
          >
            +{overflowCount} ещё
          </button>
        )}
      </div>
    </div>
  );
}
