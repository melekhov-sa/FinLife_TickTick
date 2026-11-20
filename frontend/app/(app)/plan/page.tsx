"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext,
  closestCorners,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SlidersHorizontal, X as XIcon, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/primitives/ConfirmDialog";
import { EntryRow } from "@/components/plan/EntryRow";
import {
  ENTRY_GROUP_LABELS,
  ENTRY_GROUP_ORDER,
  ENTRY_GROUP_STRIPE,
  HOLIDAY_THEME_CLS,
  RANGES,
  TABS,
  VACATION_THEME,
  entryGroupType,
  holidayTheme,
  type DayGroup,
  type EntryGroupType,
  type HolidayInfo,
  type PlanData,
  type PlanEntry,
  type PlanSummary,
} from "@/components/plan/types";
import {
  calendarGridEnd,
  calendarGridStart,
  formatMonthLabel,
  monthStartOf,
  monthToISO,
  toISODate,
} from "@/components/plan/calendar";
import { PullToRefresh } from "@/components/primitives/PullToRefresh";
import { getHolidayRU } from "@/lib/holidays";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EntryDetailModal } from "@/components/modals/EntryDetailModal";
import { DayListModal } from "@/components/modals/DayListModal";
import { CalendarMonthView } from "@/components/plan/CalendarMonthView";
import { isCompletable, completeTaskLike, uncompleteTaskLike, type CompletableKind } from "@/lib/completion";
import { useToast } from "@/components/primitives/Toast";
import { useUndoFab } from "@/components/primitives/UndoFab";
import { clsx } from "clsx";
import { CalendarDays, List, Play, SkipForward, Plus, Minus, ChevronDown, ChevronLeft, ChevronRight, MoreVertical, GripVertical, CheckCircle2, Circle } from "lucide-react";
import { api } from "@/lib/api";
import { useCompleteEvent, useUncompleteEvent } from "@/hooks/useEvents";
import { TimeInput } from "@/components/primitives/TimeInput";
import { DateInput } from "@/components/primitives/DateInput";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Button } from "@/components/primitives/Button";
import { Popover } from "@/components/primitives/Popover";
import { FormRow } from "@/components/ui/FormRow";


// ── Reschedule Modal ──────────────────────────────────────────────────────────

/**
 * Перенос записи. Ручка зависит от типа, и это важно: у записи kind="task"
 * в поле id лежит task_id, а у task_occ / event / planned_op — id ВХОЖДЕНИЯ.
 * Модалка раньше всегда била в PATCH /tasks/{entry.id}, поэтому перенос
 * повторяющейся задачи не работал вовсе, а при совпадении номеров мог молча
 * подвинуть постороннюю задачу.
 *
 * Время сохраняется только у обычной задачи: у остальных ручек в теле
 * запроса есть лишь new_date, да и колонки времени у вхождений нет.
 */
function rescheduleEntryRequest(
  kind: string,
  id: number,
  newDate: string,
  newTime?: string | null,
) {
  if (kind === "task") {
    return api.patch(`/api/v2/tasks/${id}`, { due_date: newDate, due_time: newTime || null });
  }
  if (kind === "task_occ") {
    return api.post(`/api/v2/task-occurrences/${id}/reschedule`, { new_date: newDate });
  }
  if (kind === "event") {
    return api.post(`/api/v2/events/occurrences/${id}/reschedule`, { new_date: newDate });
  }
  if (kind === "planned_op") {
    return api.patch(`/api/v2/planned-ops/occurrences/${id}`, { scheduled_date: newDate });
  }
  throw new Error("Unsupported kind: " + kind);
}

/** Время переносится только у обычной задачи — см. rescheduleEntryRequest. */
function supportsTime(kind: string): boolean {
  return kind === "task";
}

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
      await rescheduleEntryRequest(entry.kind, entry.id, date, time);
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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
        {supportsTime(entry.kind) && (
          <FormRow label="Время" hint="Необязательно">
            <TimeInput value={time} onChange={setTime} />
          </FormRow>
        )}
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


function TodayRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const R = 9;
  const C = 2 * Math.PI * R;
  return (
    <span className="relative inline-flex shrink-0" title={`${done} из ${total}`}>
      <svg width={26} height={26} viewBox="0 0 26 26" className="-rotate-90">
        <circle cx={13} cy={13} r={R} fill="none" stroke="var(--app-border)" strokeWidth={3.2} />
        <circle
          cx={13} cy={13} r={R} fill="none"
          stroke="var(--app-accent)"
          strokeWidth={3.2}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {pct >= 1 && (
        <span className="absolute inset-0 flex items-center justify-center text-[10px]" style={{ color: "var(--app-accent)" }}>✓</span>
      )}
    </span>
  );
}

// Цвет типа дела — полоска слева у строки (вместо капс-заголовков групп)

function DayGroupCard({
  group,
  onComplete,
  onCompleteEvent,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onDeleteTask,
  onSkipTaskOcc,
  onSkipEvent,
  onAddTask,
  onRescheduleAll,
  onEntryClick,
  completingKey,
  doneToday = 0,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
  onCompleteEvent: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onDeleteTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onSkipEvent: (entry: PlanEntry) => void;
  onAddTask: () => void;
  /** Только у блока просрочки: перенести всё разом. */
  onRescheduleAll?: (entries: PlanEntry[], target: "today" | "tomorrow") => void;
  onEntryClick: (entry: PlanEntry) => void;
  completingKey: string | null;
  doneToday?: number;
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
    const vTheme = !hTheme && group.vacation ? VACATION_THEME : null;
    return (
      <div
        ref={setDropRef}
        className={clsx(
          "rounded-2xl border px-3.5 py-4 transition-all shadow-[var(--dash-card-shadow)]",
          isOver && "ring-2 ring-[var(--app-accent)] bg-[var(--app-accent-weak)]",
          !isOver && (hTheme
            ? `${hTheme.bg} ${hTheme.border}`
            : vTheme
            ? `${vTheme.bg} ${vTheme.border}`
            : group.day_type === "holiday"
            ? "bg-red-50/30 dark:bg-red-500/[0.04] border-red-200/60 dark:border-red-500/15"
            : group.day_type === "weekend"
            ? "bg-sky-50/70 dark:bg-sky-500/[0.07] border-sky-300/80 dark:border-sky-400/25"
            : group.day_type === "preholiday"
            ? "bg-amber-50/40 dark:bg-amber-500/[0.04] border-amber-200 dark:border-amber-500/20"
            : "bg-[var(--dash-card-bg)] border-[var(--dash-card-border)]"),
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
          {group.vacation && (
            <span className={clsx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium", VACATION_THEME.badgeBg, VACATION_THEME.badgeText)}>
              🏖️ Отпуск
            </span>
          )}
          <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            — нет дел
          </span>
          <button
            onClick={onAddTask}
            className="ml-auto text-[12px] font-medium text-[var(--app-accent)] hover:text-[var(--app-accent)] transition-colors touch-manipulation"
          >
            + добавить
          </button>
        </div>
      </div>
    );
  }

  const hTheme = group.holiday && !group.is_overdue_group && !group.is_today ? holidayTheme(group.holiday.theme) : null;
  const vTheme = !hTheme && group.vacation && !group.is_overdue_group && !group.is_today ? VACATION_THEME : null;
  return (
    <div
      ref={setDropRef}
      style={group.is_today ? {
        boxShadow: "0 6px 26px color-mix(in srgb, var(--app-accent) 24%, transparent), 0 1px 3px rgba(0,0,0,0.06)",
      } : undefined}
      className={clsx(
        "rounded-xl px-3 py-2.5 transition-all",
        group.is_today ? "border-2" : "border-[1.5px]",
        isOver && !group.is_overdue_group && "ring-2 ring-[var(--app-accent)]",
        group.is_overdue_group
          ? "bg-red-50/50 dark:bg-red-500/[0.03] border-red-200 dark:border-red-500/25"
          : group.is_today
          ? "bg-[var(--app-accent-weak)] border-[var(--app-accent)]"
          : hTheme
          ? `${hTheme.bg} ${hTheme.border}`
          : vTheme
          ? `${vTheme.bg} ${vTheme.border}`
          : group.day_type === "holiday"
          ? "bg-red-50/30 dark:bg-red-500/[0.04] border-red-200/60 dark:border-red-500/15"
          : group.day_type === "weekend"
          ? "bg-sky-50/70 dark:bg-sky-500/[0.07] border-sky-300/80 dark:border-sky-400/25"
          : group.day_type === "preholiday"
          ? "bg-amber-50/40 dark:bg-amber-500/[0.04] border-amber-200 dark:border-amber-500/20"
          : "bg-slate-50 dark:bg-white/[0.03] border-slate-300 dark:border-white/[0.09]"
      )}
    >
      {/* Day header */}
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        {group.is_today && (
          <TodayRing done={doneToday} total={doneToday + group.entries.filter((e) => !e.is_done).length} />
        )}
        <h3 className={clsx(
          "font-semibold leading-none",
          group.is_today ? "text-[16px]" : "text-[14px]",
          group.is_overdue_group ? "text-red-600 dark:text-red-400/85"
            : group.is_today ? "text-[var(--app-accent)]"
            : "text-slate-800 dark:text-white/90"
        )}>
          {label}
        </h3>
        {group.is_today && (
          <span className="text-[10px] font-semibold text-[var(--app-accent)]/60 bg-[var(--app-accent-weak)] px-1.5 py-0.5 rounded">
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
        {group.vacation && (
          <span className={clsx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium", VACATION_THEME.badgeBg, VACATION_THEME.badgeText)}>
            🏖️ Отпуск
          </span>
        )}
        <span className="text-[11px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full" style={{ color: "var(--t-muted)" }}>
          {group.entries.length}
        </span>
        {/* Переносить просрочку по одной задаче через «⋮» → «Перенести» —
            это три тапа на каждую, а висит их обычно по четыре-шесть. */}
        {group.is_overdue_group && onRescheduleAll && group.entries.length > 1 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onRescheduleAll(group.entries, "today")}
              className="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors hover:bg-red-100/60 dark:hover:bg-red-500/15"
              style={{ color: "var(--c-danger-ink)" }}
            >
              Всё на сегодня
            </button>
            <button
              onClick={() => onRescheduleAll(group.entries, "tomorrow")}
              className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
              style={{ color: "var(--t-muted)" }}
            >
              на завтра
            </button>
          </div>
        )}

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
        <div key={g.type} className="[&:not(:first-of-type)]:mt-1.5">
          {g.entries.map((e) => (
            <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onCompleteEvent={onCompleteEvent} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onDeleteTask={onDeleteTask} onSkipTaskOcc={onSkipTaskOcc} onSkipEvent={onSkipEvent} onEntryClick={onEntryClick} isCompleting={completingKey === (e.kind + "-" + e.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DoneTodayBlock({
  entries,
  onComplete,
  onCompleteEvent,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onDeleteTask,
  onSkipTaskOcc,
  onSkipEvent,
  onEntryClick,
  completingKey,
}: {
  entries: PlanEntry[];
  onComplete: (entry: PlanEntry) => void;
  onCompleteEvent: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onDeleteTask: (entry: PlanEntry) => void;
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
            <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onCompleteEvent={onCompleteEvent} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onDeleteTask={onDeleteTask} onSkipTaskOcc={onSkipTaskOcc} onSkipEvent={onSkipEvent} onEntryClick={onEntryClick} isCompleting={completingKey === (e.kind + "-" + e.id)} />
          ))}
        </div>
      )}
    </div>
  );
}


export default function PlanPage() {
  const [tab, setTab] = useState<"active" | "done">("active");
  // По умолчанию две недели: недели мало, чтобы планировать наперёд.
  const [range, setRange] = useState(14);
  const [createTaskDate, setCreateTaskDate] = useState<string | null>(null);
  const [createEventDate, setCreateEventDate] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<PlanEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<PlanEntry | null>(null);
  const [rescheduleEntry, setRescheduleEntry] = useState<PlanEntry | null>(null);
  const [executeEntry, setExecuteEntry] = useState<PlanEntry | null>(null);
  const [activeEntry, setActiveEntry] = useState<PlanEntry | null>(null);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const qc = useQueryClient();
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const completingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { showUndo } = useUndoFab();

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
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
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
    const key = entry.kind + "-" + entry.id;
    if (completingKey === key) return;
    // Привычки — прежний путь (у них свой inline-undo).
    if (entry.kind === "habit") { setConfirmEntry(entry); return; }
    // Задачи: мгновенно выполняем + тост «Отменить» (как в TickTick), без диалога.
    const kind = entry.kind as "task" | "task_occ";
    const id = entry.id;
    setCompletingKey(key); // мгновенная галочка (строка уйдёт по подтверждению сервера)
    showUndo(() => {
      setCompletingKey(null);
      uncompleteTaskLike(kind, id)
        .then(() => {
          qc.invalidateQueries({ queryKey: ["plan"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["tasks"] });
        })
        .catch(() => toast({ title: "Не удалось отменить", variant: "danger" }));
    });
    completeTaskLike(kind, id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["plan"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["tasks"] });
      })
      .catch(() => {
        setCompletingKey(null);
        toast({ title: "Не удалось выполнить", variant: "danger" });
        qc.invalidateQueries({ queryKey: ["plan"] });
      });
  }

  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const { mutate: deleteTask, isPending: deletePending } = useMutation({
    mutationFn: (taskId: number) => api.delete(`/api/v2/tasks/${taskId}`),
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

  const { mutate: completeEvent } = useCompleteEvent();
  const { mutate: uncompleteEvent } = useUncompleteEvent();

  const [detailEntry, setDetailEntry] = useState<PlanEntry | null>(null);

  function handleSkipOp(entry: PlanEntry) {
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (occurrenceId) skipOp(occurrenceId);
  }

  function handleDeleteTask(entry: PlanEntry) {
    setDeleteEntry(entry);   // удаление необратимо — спрашиваем
  }

  /**
   * Перенести всю просрочку разом.
   *
   * Диалога нет, зато есть отмена: переносим сразу, а исходные даты держим
   * в памяти и по «Отменить» возвращаем каждую запись на своё место.
   * Спрашивать подтверждение на обратимое действие — лишний тап.
   */
  async function handleRescheduleAll(entries: PlanEntry[], target: "today" | "tomorrow") {
    const d = new Date();
    if (target === "tomorrow") d.setDate(d.getDate() + 1);
    const newDate = toISODate(d);

    const moved = entries.filter((e) => e.date && e.date !== newDate);
    if (moved.length === 0) return;

    const before = moved.map((e) => ({ kind: e.kind, id: e.id, date: e.date as string }));

    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    };

    try {
      await Promise.all(
        moved.map((e) => rescheduleEntryRequest(e.kind, e.id, newDate)),
      );
    } catch {
      toast({ title: "Не удалось перенести", variant: "danger" });
      refresh();
      return;
    }
    refresh();

    showUndo(() => {
      Promise.all(before.map((b) => rescheduleEntryRequest(b.kind, b.id, b.date)))
        .then(refresh)
        .catch(() => toast({ title: "Не удалось отменить", variant: "danger" }));
    });
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

  function handleCompleteEvent(entry: PlanEntry) {
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (!occurrenceId) return;
    if (entry.is_done) {
      uncompleteEvent(occurrenceId);
    } else {
      completeEvent(occurrenceId);
    }
  }

  const rescheduleMutation = useMutation({
    mutationFn: async ({ kind, id, newDate }: { kind: string; id: number; newDate: string }) =>
      rescheduleEntryRequest(kind, id, newDate),
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

  // Vacation spans from calendar data (used by DayListModal for any date)
  const calendarVacationSpans = useMemo(() => {
    const spans: { start: string; end: string }[] = [];
    for (const g of (calendarData ?? data)?.day_groups ?? []) {
      for (const e of g.entries) {
        if (e.kind === "event" && (e as { category_title?: string | null }).category_title?.toLowerCase() === "отпуск") {
          const start = e.date ?? "";
          const end = (e.meta?.end_date as string | undefined) || start;
          if (start) spans.push({ start, end });
        }
      }
    }
    return spans;
  }, [calendarData, data]);

  // Filter wishes + hidden groups, then fill in empty days within the range
  const filteredData = useMemo(() => {
    if (!data) return undefined;

    const populated = data.day_groups.map(g => ({
      ...g,
      entries: g.entries.filter(e => e.kind !== "wish"),
    }));

    // Compute vacation spans from list data so empty days get the flag too
    const listVacationSpans: { start: string; end: string }[] = [];
    for (const g of populated) {
      for (const e of g.entries) {
        if (e.kind === "event" && (e as { category_title?: string | null }).category_title?.toLowerCase() === "отпуск") {
          const start = e.date ?? "";
          const end = (e.meta?.end_date as string | undefined) || start;
          if (start) listVacationSpans.push({ start, end });
        }
      }
    }
    function isVacationDay(iso: string) {
      return listVacationSpans.some((s) => s.start <= iso && iso <= s.end);
    }

    // Build full date range from today
    const today = data.today;
    const allDays: DayGroup[] = [];
    const populatedByDate = new Map(populated.map(g => [g.date, g]));

    for (let i = 0; i < data.range_days; i++) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);

      // For "done" tab: stop at future days and skip empty days
      if (tab === "done" && iso > today) break;

      const existing = populatedByDate.get(iso);
      if (existing && existing.entries.length > 0) {
        allDays.push(existing);
      } else if (tab !== "done") {
        const staticHoliday = getHolidayRU(iso);
        allDays.push({
          date: iso,
          date_label: formatDayHeader(iso),
          is_today: iso === today,
          is_overdue_group: false,
          day_type: existing?.day_type,
          holiday: existing?.holiday ?? staticHoliday ?? null,
          vacation: existing?.vacation ?? isVacationDay(iso),
          entries: [],
        });
      }
    }

    // Prepend overdue group only for active tab
    const overdueGroup = populated.find(g => g.is_overdue_group);
    if (tab !== "done" && overdueGroup && overdueGroup.entries.length > 0) {
      allDays.unshift(overdueGroup);
    }

    return {
      ...data,
      day_groups: allDays,
      done_today: data.done_today.filter(e => e.kind !== "wish"),
    };
  }, [data, tab]);

  const executeInitialValues: CreateOperationInitialValues | undefined = executeEntry
    ? {
        opType: executeEntry.meta.op_kind as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
        amount: executeEntry.meta.amount != null ? String(executeEntry.meta.amount) : undefined,
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
          holiday={getHolidayRU(dayModalDate)}
          vacation={calendarVacationSpans.some((s) => s.start <= dayModalDate && dayModalDate <= s.end)}
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
      <ConfirmDialog
        open={deleteEntry !== null}
        title="Удалить задачу?"
        description={deleteEntry ? `«${deleteEntry.title}» исчезнет из плана. Это действие нельзя отменить.` : ""}
        confirmLabel="Удалить"
        destructive
        onConfirm={() => {
          if (deleteEntry && !deletePending) deleteTask(deleteEntry.id);
          setDeleteEntry(null);
        }}
        onCancel={() => setDeleteEntry(null)}
      />

      {confirmEntry && isCompletable(confirmEntry.kind) && (
        <ConfirmCompleteModal
          kind={confirmEntry.kind as CompletableKind}
          id={confirmEntry.id}
          title={confirmEntry.title}
          onClose={() => setConfirmEntry(null)}
          onCompleted={handleCompleted}
        />
      )}

      <PageHeader
        title="План"
        density="compact"
        actions={
          <a
            href="/recurring-tasks"
            className="text-[12px] font-medium px-2.5 py-1 rounded-lg border transition-colors"
            style={{ color: "var(--t-secondary)", borderColor: "var(--app-border)" }}
          >
            Повторяющиеся
          </a>
        }
      />
      <main className="flex-1 p-3 md:p-6 touch-manipulation">
        <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["plan"] })}>
        <div className="w-full">

          {/* ── Controls: фильтр одной кнопкой + сброс ─────────────── */}
          <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const isDefaultFilter = tab === "active" && range === 14 && viewMode === "list";
              const seg = (activeVal: boolean) =>
                clsx(
                  "px-2.5 py-1.5 rounded-md text-[13px] font-semibold transition-all",
                  activeVal
                    ? "bg-white dark:bg-white/[0.12] text-slate-800 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-white/50 hover:text-slate-700",
                );
              return (
                <>
                  <Popover
                    open={showFilterMenu}
                    onOpenChange={setShowFilterMenu}
                    side="bottom"
                    align="start"
                    className="!p-3 w-64"
                    trigger={
                      <button
                        className={clsx(
                          "relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold border transition-colors",
                          "bg-slate-100 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.07]",
                        )}
                        style={{ color: "var(--t-secondary)" }}
                      >
                        <SlidersHorizontal size={13} />
                        Фильтр
                        {!isDefaultFilter && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ background: "var(--app-accent)" }} />
                        )}
                      </button>
                    }
                  >
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>Статус</p>
                        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
                          {TABS.map((t) => (
                            <button key={t.value} onClick={() => setTab(t.value)} className={clsx(seg(tab === t.value), "flex-1")}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {viewMode === "list" && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>Период</p>
                          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
                            {RANGES.filter(r => r.value === 7 || r.value === 14 || r.value === 30).map((r) => (
                              <button key={r.value} onClick={() => setRange(r.value)} className={clsx(seg(range === r.value), "flex-1")}>
                                {r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>Вид</p>
                        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
                          <button onClick={() => setAndPersistViewMode("list")} className={clsx(seg(viewMode === "list"), "flex-1 flex items-center justify-center gap-1")}>
                            <List size={13} /> Список
                          </button>
                          <button onClick={() => setAndPersistViewMode("calendar")} className={clsx(seg(viewMode === "calendar"), "flex-1 flex items-center justify-center gap-1")}>
                            <CalendarDays size={13} /> Календарь
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popover>

                  {!isDefaultFilter && (
                    <button
                      onClick={() => { setTab("active"); setRange(7); setAndPersistViewMode("list"); }}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                      style={{ color: "var(--t-muted)" }}
                      title="Сбросить фильтр"
                    >
                      <XIcon size={12} />
                      Сбросить
                    </button>
                  )}
                </>
              );
            })()}

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
                  <button className="flex items-center gap-1.5 bg-[var(--app-accent)] hover:brightness-110 text-[#fff] text-[13px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors shadow-sm">
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
                className="mt-4 text-[13px] font-medium text-[var(--app-accent)]/70 hover:text-[var(--app-accent)] transition-colors"
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
              onCompleteEvent={handleCompleteEvent}
              onReschedule={setRescheduleEntry}
              onExecuteOp={setExecuteEntry}
              onSkipOp={handleSkipOp}
              onDeleteTask={handleDeleteTask}
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
            {/* List view. stagger-rise — дни всплывают каскадом при открытии. */}
            {viewMode === "list" && filteredData && (
              <div className="space-y-2 stagger-rise">
                {filteredData.day_groups.map((g, i) => (
                  <DayGroupCard
                    key={i}
                    group={g}
                    onComplete={handleOpenComplete}
                    onRescheduleAll={handleRescheduleAll}
                    onCompleteEvent={handleCompleteEvent}
                    onReschedule={setRescheduleEntry}
                    onExecuteOp={setExecuteEntry}
                    onSkipOp={handleSkipOp}
                    onDeleteTask={handleDeleteTask}
                    onSkipTaskOcc={handleSkipTaskOcc}
                    onSkipEvent={handleSkipEvent}
                    onAddTask={() => setCreateTaskDate(g.date ?? "")}
                    onEntryClick={setDetailEntry}
                    completingKey={completingKey}
                    doneToday={g.is_today ? (filteredData.done_today?.length ?? 0) : 0}
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
                <div className="px-3 py-2 rounded-xl border shadow-lg bg-white dark:bg-[#0f1221] border-[var(--app-accent)] max-w-xs">
                  <span className="text-[13px] font-medium truncate block" style={{ color: "var(--t-primary)" }}>
                    {activeEntry.category_emoji && <span className="mr-1">{activeEntry.category_emoji}</span>}
                    {activeEntry.title}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

        </div>
        </PullToRefresh>
      </main>
    </>
  );
}
