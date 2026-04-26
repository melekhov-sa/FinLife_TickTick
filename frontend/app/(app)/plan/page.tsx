"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DraggableAttributes,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EntryDetailModal } from "@/components/modals/EntryDetailModal";
import { DayListModal } from "@/components/modals/DayListModal";
import { CalendarMonthView } from "@/components/plan/CalendarMonthView";
import { isCompletable, type CompletableKind } from "@/lib/completion";
import { clsx } from "clsx";
import { CalendarDays, List, Play, SkipForward, Plus, ChevronDown, ChevronLeft, ChevronRight, MoreVertical, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { TimeInput } from "@/components/primitives/TimeInput";
import { DateInput } from "@/components/primitives/DateInput";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Button } from "@/components/primitives/Button";
import { Popover } from "@/components/primitives/Popover";
import { FormRow } from "@/components/ui/FormRow";

interface PlanEntry {
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
  entries: PlanEntry[];
}

// Federal-holiday theme → Tailwind classes for card, border and badge
const HOLIDAY_THEME_CLS: Record<string, { bg: string; border: string; badgeBg: string; badgeText: string }> = {
  winter:    { bg: "bg-sky-50 dark:bg-sky-500/[0.07]",       border: "border-sky-300/60 dark:border-sky-500/25",       badgeBg: "bg-sky-100 dark:bg-sky-500/15",       badgeText: "text-sky-700 dark:text-sky-300" },
  christmas: { bg: "bg-amber-50 dark:bg-amber-500/[0.07]",   border: "border-amber-300/60 dark:border-amber-500/25",   badgeBg: "bg-amber-100 dark:bg-amber-500/15",   badgeText: "text-amber-700 dark:text-amber-300" },
  military:  { bg: "bg-emerald-50 dark:bg-emerald-500/[0.07]", border: "border-emerald-300/60 dark:border-emerald-500/25", badgeBg: "bg-emerald-100 dark:bg-emerald-500/15", badgeText: "text-emerald-700 dark:text-emerald-300" },
  rose:      { bg: "bg-rose-50 dark:bg-rose-500/[0.07]",     border: "border-rose-300/60 dark:border-rose-500/25",     badgeBg: "bg-rose-100 dark:bg-rose-500/15",     badgeText: "text-rose-700 dark:text-rose-300" },
  spring:    { bg: "bg-lime-50 dark:bg-lime-500/[0.07]",     border: "border-lime-300/60 dark:border-lime-500/25",     badgeBg: "bg-lime-100 dark:bg-lime-500/15",     badgeText: "text-lime-700 dark:text-lime-300" },
  victory:   { bg: "bg-orange-50 dark:bg-orange-500/[0.07]", border: "border-orange-300/60 dark:border-orange-500/25", badgeBg: "bg-orange-100 dark:bg-orange-500/15", badgeText: "text-orange-700 dark:text-orange-300" },
  tricolor:  { bg: "bg-indigo-50 dark:bg-indigo-500/[0.07]", border: "border-indigo-300/60 dark:border-indigo-500/25", badgeBg: "bg-indigo-100 dark:bg-indigo-500/15", badgeText: "text-indigo-700 dark:text-indigo-300" },
  unity:     { bg: "bg-blue-50 dark:bg-blue-500/[0.07]",     border: "border-blue-300/60 dark:border-blue-500/25",     badgeBg: "bg-blue-100 dark:bg-blue-500/15",     badgeText: "text-blue-700 dark:text-blue-300" },
};

function holidayTheme(theme: string): typeof HOLIDAY_THEME_CLS[string] {
  return HOLIDAY_THEME_CLS[theme] ?? HOLIDAY_THEME_CLS.winter;
}

interface PlanSummary {
  today_count: number;
  week_count: number;
  overdue_count: number;
  done_today_count: number;
}

interface PlanData {
  tab: string;
  range_days: number;
  today: string;
  summary: PlanSummary;
  today_progress: { total: number; done: number; left: number };
  day_groups: DayGroup[];
  done_today: PlanEntry[];
}

const TABS = [
  { value: "active",  label: "Активные" },
  { value: "done",    label: "Выполненные" },
] as const;

const RANGES = [
  { value: 1,  label: "День" },
  { value: 7,  label: "Неделя" },
  { value: 30, label: "Месяц" },
  { value: 90, label: "3 мес." },
];

// ── Reschedule Modal ──────────────────────────────────────────────────────────

function RescheduleModal({
  entry,
  onClose,
}: {
  entry: PlanEntry;
  onClose: () => void;
}) {
  const [date, setDate] = useState(entry.date ?? "");
  const [time, setTime] = useState(entry.time ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  async function save() {
    if (!date) { setError("Укажите дату"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v2/tasks/${entry.id}`, {
        due_date: date || null,
        due_time: time || null,
      });
      qc.invalidateQueries({ queryKey: ["plan"] });
      onClose();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Перенести задачу"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="md" fullWidth onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" size="md" fullWidth onClick={save} disabled={!date} loading={saving}>
            Сохранить
          </Button>
        </div>
      }
    >
      <p className="text-[13px] font-medium mb-3 truncate" style={{ color: "var(--t-primary)" }}>
        {entry.title}
      </p>

      <div className="space-y-3">
        <FormRow label="Дата" required>
          <DateInput value={date} onChange={setDate} />
        </FormRow>
        <FormRow label="Время" hint="Необязательно">
          <TimeInput value={time} onChange={setTime} />
        </FormRow>
      </div>

      {error && (
        <p className="mt-3 text-[12px] text-red-500 font-medium">{error}</p>
      )}
    </BottomSheet>
  );
}

/** Format ISO date → "Пятница, 20 марта" */
function formatDayHeader(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "long" });
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  // Capitalize weekday
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  // Remove year from day string (e.g. "20 марта 2026" → "20 марта")
  const dayMonth = day.replace(/\s\d{4}$/, "");
  return `${capitalized}, ${dayMonth}`;
}


// ── Row action menu ───────────────────────────────────────────────────────────

interface RowMenuProps {
  entry: PlanEntry;
  onReschedule: () => void;
  onArchiveTask: () => void;
  onSkipTaskOcc: () => void;
  onSkipEvent: () => void;
  onExecuteOp: () => void;
  onSkipOp: () => void;
}

function RowMenu({
  entry,
  onReschedule,
  onArchiveTask,
  onSkipTaskOcc,
  onSkipEvent,
  onExecuteOp,
  onSkipOp,
}: RowMenuProps) {
  const isTask = entry.kind === 'task';
  const isTaskOcc = entry.kind === 'task_occ';
  const isOp = entry.kind === 'planned_op';
  const isEvent = entry.kind === 'event';

  const hasMenu = (isTask || isTaskOcc || isOp || isEvent) && !entry.is_done;
  if (!hasMenu) return null;

  const itemCls = 'w-full text-left px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]';
  const normalStyle: React.CSSProperties = { color: 'var(--t-primary)', fontSize: 'var(--fs-sm, 13px)' };
  const dangerStyle: React.CSSProperties = { color: 'rgb(239 68 68)', fontSize: 'var(--fs-sm, 13px)' };

  return (
    <Popover
      side="bottom"
      align="end"
      closeOnClickInside
      className="!p-0 w-44 overflow-hidden"
      trigger={
        <button
          onClick={(e) => e.stopPropagation()}
          className="md:opacity-0 md:group-hover/row:opacity-100 w-6 h-6 flex items-center justify-center rounded transition-all hover:bg-slate-100 dark:hover:bg-white/[0.08]"
          style={{ color: 'var(--t-faint)' }}
          title="Действия"
        >
          <MoreVertical size={14} />
        </button>
      }
    >
      {isTask && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onReschedule}>
            <CalendarDays size={13} className="inline mr-2 opacity-60" />
            Перенести
          </button>
          <button className={itemCls} style={dangerStyle} onClick={onArchiveTask}>
            Архивировать
          </button>
        </>
      )}

      {isTaskOcc && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onReschedule}>
            <CalendarDays size={13} className="inline mr-2 opacity-60" />
            Перенести
          </button>
          <button className={itemCls} style={dangerStyle} onClick={onSkipTaskOcc}>
            Пропустить
          </button>
        </>
      )}

      {isOp && (
        <>
          <button className={itemCls} style={normalStyle} onClick={onExecuteOp}>
            <Play size={11} className="inline mr-2 opacity-60 fill-current" />
            Выполнить
          </button>
          <button className={itemCls} style={dangerStyle} onClick={onSkipOp}>
            <SkipForward size={12} className="inline mr-2 opacity-60" />
            Пропустить
          </button>
        </>
      )}

      {isEvent && (
        <button className={itemCls} style={dangerStyle} onClick={onSkipEvent}>
          <SkipForward size={12} className="inline mr-2 opacity-60" />
          Пропустить
        </button>
      )}
    </Popover>
  );
}

function DragHandle({ attributes, listeners }: { attributes: DraggableAttributes; listeners: SyntheticListenerMap | undefined }) {
  return (
    <button
      {...attributes}
      {...listeners}
      className="shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover/row:opacity-50 md:opacity-0 md:group-hover/row:opacity-50 opacity-30 md:touch-none cursor-grab active:cursor-grabbing transition-opacity"
      style={{ color: "var(--t-faint)", touchAction: "none" }}
      tabIndex={-1}
      aria-label="Перетащить"
    >
      <GripVertical size={12} />
    </button>
  );
}

function EntryRow({
  entry,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onArchiveTask,
  onSkipTaskOcc,
  onSkipEvent,
  onEntryClick,
  isCompleting,
}: {
  entry: PlanEntry;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onSkipEvent: (entry: PlanEntry) => void;
  onEntryClick?: (entry: PlanEntry) => void;
  isCompleting?: boolean;
}) {
  const canComplete = isCompletable(entry.kind) && !entry.is_done;
  const isOp = entry.kind === "planned_op";
  const opKind = entry.meta.op_kind as string | undefined;
  const amountFormatted = entry.meta.amount_formatted as string | undefined;

  const canDrag = (entry.kind === "task" || entry.kind === "event" || entry.kind === "planned_op") && !entry.is_done;
  const draggableId = `${entry.kind}-${entry.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    disabled: !canDrag,
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "flex items-center gap-2.5 py-[7px] border-t first:border-0 transition-colors cursor-default group/row",
        "border-slate-100/70 dark:border-white/[0.05] hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
        isCompleting && "task-row-completing",
        isDragging && "opacity-30",
      )}
    >
      {/* Checkbox / icon */}
      <div className="shrink-0">
        {canComplete ? (
          <button
            onClick={() => { if (!isCompleting) onComplete(entry); }}
            className={clsx(
              "relative w-[16px] h-[16px] rounded-full border-[1.5px] transition-all hover:scale-110 flex items-center justify-center",
              entry.is_overdue
                ? "border-red-400 hover:bg-red-500/20"
                : "border-violet-300/70 dark:border-violet-400/40 hover:bg-violet-500/15 hover:border-violet-400",
              isCompleting && "task-check-completing",
            )}
            title="Отметить как выполненное"
          >
            <span className="task-check-mark" aria-hidden="true">✓</span>
          </button>
        ) : entry.is_done && isCompletable(entry.kind) ? (
          <div className="w-[16px] h-[16px] rounded-full bg-emerald-500 flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">✓</span>
          </div>
        ) : isOp ? (
          <div className="w-[16px] h-[16px] rounded-full border-[1.5px] border-amber-300 dark:border-amber-400/50 shrink-0" />
        ) : entry.kind === "event" ? (
          <div className="w-[16px] h-[16px] shrink-0" aria-hidden="true" />
        ) : (
          <div className="w-[16px] h-[16px] rounded-full border-[1.5px] border-slate-200 dark:border-white/20 shrink-0" />
        )}
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEntryClick?.(entry)}>
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            "task-title-text text-[14px] font-medium leading-snug truncate",
            entry.is_done ? "line-through decoration-slate-300 dark:decoration-white/20" : "",
            entry.is_overdue && !entry.is_done ? "text-red-500 dark:text-red-400/90" : ""
          )} style={{ color: entry.is_done ? "var(--t-muted)" : (entry.is_overdue ? undefined : "var(--t-primary)") }}>
            {entry.category_emoji && <span className="mr-0.5">{entry.category_emoji}</span>}
            {entry.title}
          </span>

          {/* Only useful meta — no kind chips */}
          {isOp && amountFormatted && (
            <span className={clsx(
              "text-[12px] font-semibold tabular-nums shrink-0",
              opKind === "INCOME" ? "money-income" : "money-expense"
            )}>
              {opKind === "INCOME" ? "+" : "\u2212"}{amountFormatted} ₽
            </span>
          )}

          {entry.kind === "habit" && Boolean(entry.meta.current_streak) && (
            <span className="text-[11px] shrink-0" style={{ color: "var(--t-muted)" }}>
              🔥{String(entry.meta.current_streak)}
            </span>
          )}

          {entry.is_overdue && !entry.is_done && (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/[0.12] px-1 py-px rounded shrink-0">
              просроч.
            </span>
          )}

          {entry.time && (
            <span className="text-[11px] tabular-nums shrink-0 ml-auto" style={{ color: "var(--t-muted)" }}>
              {entry.time}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <RowMenu
          entry={entry}
          onReschedule={() => onReschedule(entry)}
          onArchiveTask={() => onArchiveTask(entry)}
          onSkipTaskOcc={() => onSkipTaskOcc(entry)}
          onSkipEvent={() => onSkipEvent(entry)}
          onExecuteOp={() => onExecuteOp(entry)}
          onSkipOp={() => onSkipOp(entry)}
        />
      </div>

      {canDrag && (
        <DragHandle
          attributes={attributes}
          listeners={listeners}
        />
      )}
    </div>
  );
}

type EntryGroupType = "tasks" | "habits" | "events" | "ops";

const ENTRY_GROUP_ORDER: EntryGroupType[] = ["tasks", "habits", "events", "ops"];
const ENTRY_GROUP_LABELS: Record<EntryGroupType, string> = {
  tasks: "Задачи", habits: "Привычки", events: "События", ops: "Финансы",
};

function entryGroupType(kind: string): EntryGroupType {
  if (kind === "task" || kind === "task_occ") return "tasks";
  if (kind === "habit") return "habits";
  if (kind === "event") return "events";
  return "ops";
}

function EntryGroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.05em] pt-3.5 pb-0.5 first:pt-0" style={{ color: "var(--t-muted)", opacity: 0.5 }}>
      {label}
    </p>
  );
}

function DayGroupCard({
  group,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onArchiveTask,
  onSkipTaskOcc,
  onSkipEvent,
  onAddTask,
  onEntryClick,
  completingKey,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onSkipEvent: (entry: PlanEntry) => void;
  onAddTask: () => void;
  onEntryClick: (entry: PlanEntry) => void;
  completingKey: string | null;
}) {
  const label = group.date && !group.is_overdue_group
    ? formatDayHeader(group.date)
    : group.date_label;

  // Group entries by type
  const grouped = useMemo(() => ENTRY_GROUP_ORDER
    .map((gt) => ({
      type: gt,
      entries: group.entries.filter((e) => entryGroupType(e.kind) === gt),
    }))
    .filter((g) => g.entries.length > 0), [group.entries]);

  const isEmpty = group.entries.length === 0;
  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
  const isPast = !group.is_today && !group.is_overdue_group && !!group.date && group.date < todayIso;

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `date-${group.date}`,
    disabled: group.is_overdue_group || !group.date,
  });

  // Empty today — dashboard already has "Фокус дня"
  if (isEmpty && group.is_today) return null;
  // Empty past day — no reason to show (overdue tasks appear in the overdue section)
  if (isEmpty && isPast) return null;

  if (isEmpty) {
    const hTheme = group.holiday ? holidayTheme(group.holiday.theme) : null;
    return (
      <div
        ref={setDropRef}
        className={clsx(
          "rounded-xl border-[1.5px] px-3 py-3.5 transition-all",
          isOver && "ring-2 ring-indigo-400/50 bg-indigo-50/60 dark:bg-indigo-500/[0.08]",
          !isOver && (hTheme
            ? `${hTheme.bg} ${hTheme.border}`
            : group.day_type === "holiday"
            ? "bg-red-50/30 dark:bg-red-500/[0.04] border-red-200/60 dark:border-red-500/15"
            : group.day_type === "weekend"
            ? "bg-slate-100 dark:bg-white/[0.04] border-slate-300 dark:border-white/[0.1]"
            : group.day_type === "preholiday"
            ? "bg-amber-50/40 dark:bg-amber-500/[0.04] border-amber-200 dark:border-amber-500/20"
            : "bg-slate-50 dark:bg-white/[0.03] border-slate-300 dark:border-white/[0.09]"),
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[14px] font-semibold leading-none text-slate-800 dark:text-white/90">
            {label}
          </h3>
          {group.holiday && hTheme && (
            <span className={clsx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium", hTheme.badgeBg, hTheme.badgeText)}>
              <span>{group.holiday.icon}</span>{group.holiday.name}
            </span>
          )}
          <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            — нет дел
          </span>
          <button
            onClick={onAddTask}
            className="ml-auto text-[12px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors touch-manipulation"
          >
            + добавить
          </button>
        </div>
      </div>
    );
  }

  const hTheme = group.holiday && !group.is_overdue_group && !group.is_today ? holidayTheme(group.holiday.theme) : null;
  return (
    <div
      ref={setDropRef}
      className={clsx(
        "rounded-xl border-[1.5px] px-3 py-2.5 transition-all",
        isOver && !group.is_overdue_group && "ring-2 ring-indigo-400/50",
        group.is_overdue_group
          ? "bg-red-50/50 dark:bg-red-500/[0.03] border-red-200 dark:border-red-500/25"
          : group.is_today
          ? "bg-indigo-50/40 dark:bg-indigo-500/[0.04] border-indigo-200 dark:border-indigo-500/35"
          : hTheme
          ? `${hTheme.bg} ${hTheme.border}`
          : group.day_type === "holiday"
          ? "bg-red-50/30 dark:bg-red-500/[0.04] border-red-200/60 dark:border-red-500/15"
          : group.day_type === "weekend"
          ? "bg-slate-100 dark:bg-white/[0.04] border-slate-300 dark:border-white/[0.1]"
          : group.day_type === "preholiday"
          ? "bg-amber-50/40 dark:bg-amber-500/[0.04] border-amber-200 dark:border-amber-500/20"
          : "bg-slate-50 dark:bg-white/[0.03] border-slate-300 dark:border-white/[0.09]"
      )}
    >
      {/* Day header */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h3 className={clsx(
          "text-[14px] font-semibold leading-none",
          group.is_overdue_group ? "text-red-600 dark:text-red-400/85"
            : group.is_today ? "text-indigo-600 dark:text-indigo-300/90"
            : "text-slate-800 dark:text-white/90"
        )}>
          {label}
        </h3>
        {group.is_today && (
          <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400/60 bg-indigo-100 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded">
            сегодня
          </span>
        )}
        {group.holiday && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium",
              hTheme
                ? `${hTheme.badgeBg} ${hTheme.badgeText}`
                : `${holidayTheme(group.holiday.theme).badgeBg} ${holidayTheme(group.holiday.theme).badgeText}`
            )}
            title={group.holiday.name}
          >
            <span>{group.holiday.icon}</span>{group.holiday.name}
          </span>
        )}
        <span className="text-[11px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full" style={{ color: "var(--t-muted)" }}>
          {group.entries.length}
        </span>
        {!group.is_overdue_group && (
          <button
            onClick={onAddTask}
            className="ml-auto w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
            style={{ color: "var(--t-faint)" }}
            title="Добавить задачу"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Type-grouped entries */}
      {grouped.map((g) => (
        <div key={g.type}>
          {grouped.length > 1 && <EntryGroupHeader label={ENTRY_GROUP_LABELS[g.type]} />}
          {g.entries.map((e) => (
            <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onArchiveTask={onArchiveTask} onSkipTaskOcc={onSkipTaskOcc} onSkipEvent={onSkipEvent} onEntryClick={onEntryClick} isCompleting={completingKey === (e.kind + "-" + e.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DoneTodayBlock({
  entries,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onArchiveTask,
  onSkipTaskOcc,
  onSkipEvent,
  onEntryClick,
  completingKey,
}: {
  entries: PlanEntry[];
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onSkipEvent: (entry: PlanEntry) => void;
  onEntryClick: (entry: PlanEntry) => void;
  completingKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] mb-2 overflow-hidden bg-white dark:bg-transparent">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
      >
        <span className="text-emerald-500 text-[12px]">✓</span>
        <span className="text-[12px] font-medium" style={{ color: "var(--t-faint)" }}>
          Выполнено сегодня
        </span>
        <span className="text-[12px] font-bold tabular-nums text-emerald-500">{entries.length}</span>
        <ChevronDown
          size={12}
          className={clsx("ml-auto transition-transform", expanded && "rotate-180")}
          style={{ color: "var(--t-faint)" }}
        />
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-slate-100 dark:border-white/[0.05]">
          {entries.map((e) => (
            <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onArchiveTask={onArchiveTask} onSkipTaskOcc={onSkipTaskOcc} onSkipEvent={onSkipEvent} onEntryClick={onEntryClick} isCompleting={completingKey === (e.kind + "-" + e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Returns Date object for the first day of a given month. */
function monthStartOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Returns ISO string YYYY-MM-DD for a local Date (first of month). */
function monthToISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Returns the Monday of the week containing the first of the month (for calendar start). */
function calendarGridStart(monthStart: Date): Date {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  const dow = first.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(first);
  monday.setDate(first.getDate() + diff);
  return monday;
}

/** Returns the Sunday of the week containing the last of the month. */
function calendarGridEnd(monthStart: Date): Date {
  const last = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const dow = last.getDay(); // 0=Sun
  const diff = dow === 0 ? 0 : 7 - dow;
  const sunday = new Date(last);
  sunday.setDate(last.getDate() + diff);
  return sunday;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

export default function PlanPage() {
  const [tab, setTab] = useState<"active" | "done">("active");
  const [range, setRange] = useState(7);
  const [createTaskDate, setCreateTaskDate] = useState<string | null>(null);
  const [createEventDate, setCreateEventDate] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<PlanEntry | null>(null);
  const [rescheduleEntry, setRescheduleEntry] = useState<PlanEntry | null>(null);
  const [executeEntry, setExecuteEntry] = useState<PlanEntry | null>(null);
  const [activeEntry, setActiveEntry] = useState<PlanEntry | null>(null);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const qc = useQueryClient();
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const completingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── View mode: list | calendar ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"list" | "calendar">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("plan-view-mode");
      if (stored === "calendar") return "calendar";
    }
    return "list";
  });

  function setAndPersistViewMode(mode: "list" | "calendar") {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("plan-view-mode", mode);
    }
  }

  // ── Calendar month state ───────────────────────────────────────────────
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => monthStartOf(new Date()));

  function goToPrevMonth() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function goToNextMonth() {
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function goToToday() {
    setCalendarMonth(monthStartOf(new Date()));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => { return () => { if (completingTimerRef.current) clearTimeout(completingTimerRef.current); }; }, []);

  function handleCompleted(kind: "task" | "habit" | "task_occ", id: number) {
    if (kind === "habit") { qc.invalidateQueries({ queryKey: ["plan"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); return; }
    const key = kind + "-" + id;
    setCompletingKey(key);
    if (completingTimerRef.current) clearTimeout(completingTimerRef.current);
    completingTimerRef.current = setTimeout(() => { setCompletingKey(null); qc.invalidateQueries({ queryKey: ["plan"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); }, 450);
  }

  function handleOpenComplete(entry: PlanEntry) {
    if (completingKey === entry.kind + "-" + entry.id) return;
    setConfirmEntry(entry);
  }

  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const { mutate: archiveTask, isPending: archivePending } = useMutation({
    mutationFn: (taskId: number) =>
      api.post(`/api/v2/tasks/${taskId}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const { mutate: skipTaskOcc, isPending: skipTaskOccPending } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/task-occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const { mutate: skipEventOcc, isPending: skipEventOccPending } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.delete(`/api/v2/events/occurrences/${occurrenceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const [detailEntry, setDetailEntry] = useState<PlanEntry | null>(null);

  function handleSkipOp(entry: PlanEntry) {
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (occurrenceId) skipOp(occurrenceId);
  }

  function handleArchiveTask(entry: PlanEntry) {
    if (archivePending) return;
    archiveTask(entry.id);
  }

  function handleSkipTaskOcc(entry: PlanEntry) {
    if (skipTaskOccPending) return;
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (occurrenceId) skipTaskOcc(occurrenceId);
  }

  function handleSkipEvent(entry: PlanEntry) {
    if (skipEventOccPending) return;
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (occurrenceId) skipEventOcc(occurrenceId);
  }

  const rescheduleMutation = useMutation({
    mutationFn: async ({ kind, id, newDate }: { kind: string; id: number; newDate: string }) => {
      if (kind === "task") {
        return api.patch(`/api/v2/tasks/${id}`, { due_date: newDate });
      }
      if (kind === "event") {
        return api.patch(`/api/v2/events/occurrences/${id}`, { start_date: newDate });
      }
      if (kind === "planned_op") {
        return api.patch(`/api/v2/planned-ops/occurrences/${id}`, { scheduled_date: newDate });
      }
      throw new Error("Unsupported kind: " + kind);
    },
    onMutate: async ({ kind, id, newDate }) => {
      await qc.cancelQueries({ queryKey: ["plan"] });
      const snapshot = qc.getQueryData<PlanData>(["plan", tab, range]);
      if (snapshot) {
        const updated: PlanData = {
          ...snapshot,
          day_groups: snapshot.day_groups.map((g) => {
            // Remove from source group
            if (g.entries.some((e) => e.kind === kind && e.id === id)) {
              return { ...g, entries: g.entries.filter((e) => !(e.kind === kind && e.id === id)) };
            }
            // Add to target group
            if (g.date === newDate) {
              const movingEntry = snapshot.day_groups
                .flatMap((dg) => dg.entries)
                .find((e) => e.kind === kind && e.id === id);
              if (movingEntry) {
                return { ...g, entries: [...g.entries, { ...movingEntry, date: newDate, is_overdue: false }] };
              }
            }
            return g;
          }),
        };
        qc.setQueryData<PlanData>(["plan", tab, range], updated);
      }
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<PlanData>(["plan", tab, range], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["plan-calendar"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function handleDragStart(e: DragStartEvent) {
    const activeId = String(e.active.id);
    const dashIdx = activeId.indexOf("-");
    const kind = activeId.slice(0, dashIdx);
    const id = Number(activeId.slice(dashIdx + 1));
    // Try list query first, then calendar query
    const listEntries = qc.getQueryData<PlanData>(["plan", tab, range])?.day_groups.flatMap((g) => g.entries) ?? [];
    const calEntries = qc.getQueryData<PlanData>(["plan-calendar", calendarMonthKey, tab])?.day_groups.flatMap((g) => g.entries) ?? [];
    const allEntries = [...listEntries, ...calEntries];
    const entry = allEntries.find((en) => en.kind === kind && en.id === id) ?? null;
    setActiveEntry(entry);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveEntry(null);
    const { active, over } = e;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (!overId.startsWith("date-")) return;
    const newDate = overId.slice(5);

    const dashIdx = activeId.indexOf("-");
    const kind = activeId.slice(0, dashIdx);
    const id = Number(activeId.slice(dashIdx + 1));

    const listEntries = qc.getQueryData<PlanData>(["plan", tab, range])?.day_groups.flatMap((g) => g.entries) ?? [];
    const calEntries = qc.getQueryData<PlanData>(["plan-calendar", calendarMonthKey, tab])?.day_groups.flatMap((g) => g.entries) ?? [];
    const allEntries = [...listEntries, ...calEntries];
    const entry = allEntries.find((en) => en.kind === kind && en.id === id);
    if (!entry || entry.date === newDate) return;

    rescheduleMutation.mutate({ kind, id, newDate });
  }

  const { data, isLoading, isError } = useQuery<PlanData>({
    queryKey: ["plan", tab, range],
    queryFn: () => api.get<PlanData>(`/api/v2/plan?tab=${tab}&range=${range}`),
    staleTime: 30_000,
  });

  // Calendar-specific query: full month window (up to 42 days from grid start)
  const calendarGridStartDate = calendarGridStart(calendarMonth);
  const calendarGridEndDate = calendarGridEnd(calendarMonth);
  const calendarRangeDays = Math.round(
    (calendarGridEndDate.getTime() - calendarGridStartDate.getTime()) / 86_400_000
  ) + 1;
  const calendarStartISO = toISODate(calendarGridStartDate);
  const calendarMonthKey = monthToISO(calendarMonth);

  const { data: calendarData, isLoading: calendarLoading } = useQuery<PlanData>({
    queryKey: ["plan-calendar", calendarMonthKey, tab],
    queryFn: () =>
      api.get<PlanData>(
        `/api/v2/plan?tab=${tab}&range=${calendarRangeDays}&start_date=${calendarStartISO}`,
      ),
    staleTime: 30_000,
    enabled: viewMode === "calendar",
  });

  // Filter wishes, then fill in empty days within the range
  const filteredData = useMemo(() => {
    if (!data) return undefined;

    const populated = data.day_groups.map(g => ({
      ...g,
      entries: g.entries.filter(e => e.kind !== "wish"),
    }));

    // Build full date range from today
    const today = data.today;
    const allDays: DayGroup[] = [];
    const populatedByDate = new Map(populated.map(g => [g.date, g]));

    for (let i = 0; i < data.range_days; i++) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const existing = populatedByDate.get(iso);
      if (existing && existing.entries.length > 0) {
        allDays.push(existing);
      } else {
        allDays.push({
          date: iso,
          date_label: formatDayHeader(iso),
          is_today: iso === today,
          is_overdue_group: false,
          day_type: existing?.day_type,
          entries: [],
        });
      }
    }

    // Prepend overdue group if it exists
    const overdueGroup = populated.find(g => g.is_overdue_group);
    if (overdueGroup && overdueGroup.entries.length > 0) {
      allDays.unshift(overdueGroup);
    }

    return {
      ...data,
      day_groups: allDays,
      done_today: data.done_today.filter(e => e.kind !== "wish"),
    };
  }, [data]);

  const executeInitialValues: CreateOperationInitialValues | undefined = executeEntry
    ? {
        opType: executeEntry.meta.op_kind as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
        amount: executeEntry.meta.amount as string | undefined,
        walletId: executeEntry.meta.wallet_id as number | undefined,
        fromWalletId: executeEntry.meta.wallet_id as number | undefined,
        toWalletId: executeEntry.meta.destination_wallet_id as number | undefined,
        categoryId: executeEntry.meta.category_id as number | undefined,
      }
    : undefined;

  return (
    <>
      {createTaskDate !== null && <CreateTaskModal initialDate={createTaskDate || undefined} onClose={() => setCreateTaskDate(null)} />}
      {createEventDate !== null && <CreateEventModal initialDate={createEventDate || undefined} onClose={() => setCreateEventDate(null)} />}
      {detailEntry && <EntryDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
      {dayModalDate && (
        <DayListModal
          dateISO={dayModalDate}
          entries={
            (calendarData ?? data)?.day_groups.find((g) => g.date === dayModalDate)?.entries.filter((e) => e.kind !== "wish") ?? []
          }
          onClose={() => setDayModalDate(null)}
          onEntryClick={(entry) => { setDayModalDate(null); setDetailEntry(entry); }}
          onAddTask={() => { setDayModalDate(null); setCreateTaskDate(dayModalDate ?? ""); }}
        />
      )}
      {rescheduleEntry && (
        <RescheduleModal entry={rescheduleEntry} onClose={() => setRescheduleEntry(null)} />
      )}
      {executeEntry && (
        <CreateOperationModal
          initialValues={executeInitialValues}
          occurrenceId={executeEntry.meta.occurrence_id as number | undefined}
          onClose={() => setExecuteEntry(null)}
        />
      )}
      {confirmEntry && isCompletable(confirmEntry.kind) && (
        <ConfirmCompleteModal
          kind={confirmEntry.kind as CompletableKind}
          id={confirmEntry.id}
          title={confirmEntry.title}
          onClose={() => setConfirmEntry(null)}
          onCompleted={handleCompleted}
        />
      )}

      <AppTopbar title="План" />
      <main className="flex-1 overflow-auto p-3 md:p-6 touch-manipulation">
        <div className="w-full">

          {/* ── Controls — compact ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Status: Активные / Выполненные */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-all",
                    tab === t.value
                      ? "bg-white dark:bg-indigo-600 text-slate-800 dark:text-white shadow-sm"
                      : "text-slate-500 dark:text-white/50 hover:text-slate-700"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Period: Неделя / Месяц (list mode only) */}
            {viewMode === "list" && (
              <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
                {RANGES.filter(r => r.value === 7 || r.value === 30).map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={clsx(
                      "px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-all",
                      range === r.value
                        ? "bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm"
                        : "text-slate-500 dark:text-white/50 hover:text-slate-700"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {/* View mode toggle: Список / Календарь */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
              <button
                onClick={() => setAndPersistViewMode("list")}
                title="Список"
                className={clsx(
                  "w-7 h-7 flex items-center justify-center rounded-md transition-all",
                  viewMode === "list"
                    ? "bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/50 hover:text-slate-700",
                )}
              >
                <List size={13} />
              </button>
              <button
                onClick={() => setAndPersistViewMode("calendar")}
                title="Календарь"
                className={clsx(
                  "w-7 h-7 flex items-center justify-center rounded-md transition-all",
                  viewMode === "calendar"
                    ? "bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/50 hover:text-slate-700",
                )}
              >
                <CalendarDays size={13} />
              </button>
            </div>

            {/* Add button */}
            <div className="ml-auto">
              <Popover
                open={showAddMenu}
                onOpenChange={setShowAddMenu}
                side="bottom"
                align="end"
                closeOnClickInside
                className="!p-0 w-40 overflow-hidden"
                trigger={
                  <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors shadow-sm">
                    <Plus size={14} />
                    <span className="hidden md:inline">Добавить</span>
                    <ChevronDown size={12} className={clsx("transition-transform hidden md:block", showAddMenu && "rotate-180")} />
                  </button>
                }
              >
                <button
                  onClick={() => setCreateTaskDate("")}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  style={{ color: "var(--t-primary)" }}
                >
                  Задача
                </button>
                <button
                  onClick={() => setCreateEventDate("")}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  style={{ color: "var(--t-primary)" }}
                >
                  Событие
                </button>
              </Popover>
            </div>
          </div>

          {/* ── Calendar navigation ───────────────────────────────── */}
          {viewMode === "calendar" && (
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={goToPrevMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                style={{ color: "var(--t-secondary)" }}
                title="Предыдущий месяц"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="flex-1 text-center text-[13px] font-semibold capitalize" style={{ color: "var(--t-primary)" }}>
                {formatMonthLabel(calendarMonth)}
              </span>
              <button
                onClick={goToNextMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                style={{ color: "var(--t-secondary)" }}
                title="Следующий месяц"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={goToToday}
                className="px-2.5 py-1 text-[12px] font-semibold rounded-lg border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                style={{ color: "var(--t-secondary)" }}
              >
                Сегодня
              </button>
            </div>
          )}

          {/* ── Loading ───────────────────────────────────────────────── */}
          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={96} className="rounded-xl" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-red-600/80 dark:text-red-400/70 text-sm text-center py-12">Не удалось загрузить план</p>
          )}

          {/* ── Empty state ───────────────────────────────────────────── */}
          {filteredData && filteredData.day_groups.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <span className="text-xl">📅</span>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                Ничего не запланировано на этот период
              </p>
              <button
                onClick={() => setCreateTaskDate("")}
                className="mt-4 text-[13px] font-medium text-indigo-600 dark:text-indigo-400/70 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
              >
                + Создать задачу
              </button>
            </div>
          )}

          {/* ── Done today (collapsible) ──────────────────────────────── */}
          {filteredData && tab === "active" && filteredData.done_today.length > 0 && (
            <DoneTodayBlock
              entries={filteredData.done_today}
              onComplete={handleOpenComplete}
              onReschedule={setRescheduleEntry}
              onExecuteOp={setExecuteEntry}
              onSkipOp={handleSkipOp}
              onArchiveTask={handleArchiveTask}
              onSkipTaskOcc={handleSkipTaskOcc}
              onSkipEvent={handleSkipEvent}
              onEntryClick={setDetailEntry}
              completingKey={completingKey}
            />
          )}

          {/* ── Day groups / Calendar (with DnD) ──────────────────────── */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* List view */}
            {viewMode === "list" && filteredData && (
              <div className="space-y-2">
                {filteredData.day_groups.map((g, i) => (
                  <DayGroupCard
                    key={i}
                    group={g}
                    onComplete={handleOpenComplete}
                    onReschedule={setRescheduleEntry}
                    onExecuteOp={setExecuteEntry}
                    onSkipOp={handleSkipOp}
                    onArchiveTask={handleArchiveTask}
                    onSkipTaskOcc={handleSkipTaskOcc}
                    onSkipEvent={handleSkipEvent}
                    onAddTask={() => setCreateTaskDate(g.date ?? "")}
                    onEntryClick={setDetailEntry}
                    completingKey={completingKey}
                  />
                ))}
              </div>
            )}

            {/* Calendar view */}
            {viewMode === "calendar" && (
              <>
                {calendarLoading && (
                  <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-white/[0.08] rounded-lg overflow-hidden animate-pulse">
                    {[...Array(42)].map((_, i) => (
                      <div key={i} className="min-h-[72px] md:min-h-[100px] bg-white dark:bg-[#0f1221]" />
                    ))}
                  </div>
                )}
                {!calendarLoading && calendarData && (
                  <CalendarMonthView
                    monthStart={calendarMonth}
                    data={calendarData}
                    onDayClick={setDayModalDate}
                    onEntryClick={setDetailEntry}
                  />
                )}
              </>
            )}

            <DragOverlay>
              {activeEntry && (
                <div className="px-3 py-2 rounded-xl border shadow-lg bg-white dark:bg-[#0f1221] border-indigo-300 dark:border-indigo-500/40 max-w-xs">
                  <span className="text-[13px] font-medium truncate block" style={{ color: "var(--t-primary)" }}>
                    {activeEntry.category_emoji && <span className="mr-1">{activeEntry.category_emoji}</span>}
                    {activeEntry.title}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

        </div>
      </main>
    </>
  );
}
