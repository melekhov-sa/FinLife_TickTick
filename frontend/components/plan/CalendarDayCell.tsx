"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { clsx } from "clsx";

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

interface CalendarDayCellProps {
  dateISO: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  group: DayGroup | null;
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
  onDayClick,
  onEntryClick,
}: CalendarDayCellProps) {
  const entries = group?.entries ?? [];
  const visibleEntries = entries.slice(0, MAX_PILLS);
  const overflowCount = entries.length - MAX_PILLS;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `date-${dateISO}`,
  });

  const dayNum = parseInt(dateISO.split("-")[2], 10);
  const isWeekend = group?.day_type === "weekend" || group?.day_type === "holiday";

  return (
    <div
      ref={setDropRef}
      className={clsx(
        "relative flex flex-col min-h-[72px] md:min-h-[100px] p-0.5 md:p-1 cursor-pointer transition-colors",
        "bg-white dark:bg-[#0f1221]",
        isOver && "ring-2 ring-inset ring-indigo-400/60 bg-indigo-50/40 dark:bg-indigo-500/[0.07]",
        isToday && !isOver && "ring-2 ring-inset ring-indigo-400/50",
        isWeekend && !isToday && !isOver && "bg-slate-50/80 dark:bg-white/[0.02]",
        !isCurrentMonth && "opacity-40",
      )}
      onClick={() => onDayClick(dateISO)}
    >
      {/* Day number + holiday icon */}
      <div className="flex items-start justify-between mb-0.5">
        <span
          className={clsx(
            "text-[11px] md:text-[12px] font-semibold leading-none px-0.5",
            isToday
              ? "text-indigo-600 dark:text-indigo-400"
              : isWeekend
              ? "text-rose-500 dark:text-rose-400/80"
              : "text-slate-600 dark:text-white/60",
          )}
        >
          {dayNum}
        </span>
        {group?.holiday && (
          <span className="text-[10px] leading-none" title={group.holiday.name}>
            {group.holiday.icon}
          </span>
        )}
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
