"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { clsx } from "clsx";
import { CheckCircle2, Circle, SkipForward, Play, Plus, Bell, Minus, ListChecks, Repeat2, CalendarDays, Wallet, type LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIncrementHabitToday, useDecrementHabitToday } from "@/hooks/useHabits";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import { useCreateTask, useReorderTasks } from "@/hooks/useTasks";
import { useCompleteEvent, useUncompleteEvent } from "@/hooks/useEvents";
import { isCompletable, type CompletableKind } from "@/lib/completion";
import { pluralizeYears } from "@/lib/utils";
import type { TodayBlock as TodayBlockType, DashboardItem, UpcomingPayment } from "@/types/api";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { EntryDetailModal } from "@/components/modals/EntryDetailModal";
import { Button } from "@/components/primitives/Button";
import { Tooltip } from "@/components/primitives/Tooltip";

interface Props {
  today: TodayBlockType;
  plannedOps: UpcomingPayment[];
}

// Federal-holiday theme → Tailwind classes
const HOLIDAY_THEME_CLS: Record<string, { bg: string; border: string; text: string }> = {
  winter:    { bg: "bg-sky-50 dark:bg-sky-500/[0.08]",         border: "border-sky-300/60 dark:border-sky-500/25",         text: "text-sky-700 dark:text-sky-300" },
  christmas: { bg: "bg-amber-50 dark:bg-amber-500/[0.08]",     border: "border-amber-300/60 dark:border-amber-500/25",     text: "text-amber-700 dark:text-amber-300" },
  military:  { bg: "bg-emerald-50 dark:bg-emerald-500/[0.08]", border: "border-emerald-300/60 dark:border-emerald-500/25", text: "text-emerald-700 dark:text-emerald-300" },
  rose:      { bg: "bg-rose-50 dark:bg-rose-500/[0.08]",       border: "border-rose-300/60 dark:border-rose-500/25",       text: "text-rose-700 dark:text-rose-300" },
  spring:    { bg: "bg-lime-50 dark:bg-lime-500/[0.08]",       border: "border-lime-300/60 dark:border-lime-500/25",       text: "text-lime-700 dark:text-lime-300" },
  victory:   { bg: "bg-orange-50 dark:bg-orange-500/[0.08]",   border: "border-orange-300/60 dark:border-orange-500/25",   text: "text-orange-700 dark:text-orange-300" },
  tricolor:  { bg: "bg-indigo-50 dark:bg-indigo-500/[0.08]",   border: "border-indigo-300/60 dark:border-indigo-500/25",   text: "text-indigo-700 dark:text-indigo-300" },
  unity:     { bg: "bg-blue-50 dark:bg-blue-500/[0.08]",       border: "border-blue-300/60 dark:border-blue-500/25",       text: "text-blue-700 dark:text-blue-300" },
};

// ── Chip helpers ──────────────────────────────────────────────────────────────

// Stable pastel palette — same category name always maps to the same colour
const CATEGORY_COLORS = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

function categoryColorClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

function CategoryChip({ name, emoji }: { name: string; emoji?: string | null }) {
  const colorCls = categoryColorClass(name);
  return (
    <span className={`inline-flex items-center h-6 px-2 gap-1 rounded-md text-[12px] font-medium leading-none shrink-0 ${colorCls}`}>
      {emoji && <span aria-hidden className="leading-none">{emoji}</span>}
      <span className="whitespace-nowrap">{name}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

function Item({
  item,
  onComplete,
  isCompleting,
  dragHandleProps,
  onItemClick,
  onCompleteEvent,
}: {
  item: DashboardItem;
  onComplete: (item: DashboardItem) => void;
  isCompleting?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onItemClick?: (item: DashboardItem) => void;
  onCompleteEvent?: (item: DashboardItem) => void;
}) {
  const { title, is_done: isDone, is_overdue: isOverdue, time, kind } = item;
  const categoryName = item.category_name ?? null;
  const canComplete = isCompletable(kind) && !isDone;
  const reminders = (item.meta?.reminders as string[]) ?? [];
  const timeStr = time ? String(time).slice(0, 5) : null;
  const isClickable = !!(onItemClick && (kind === "task" || kind === "task_occ" || kind === "event") && !isDone);

  return (
    <div
      {...(dragHandleProps ?? {})}
      className={clsx(
        "flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1",
        isOverdue && !isDone && "bg-red-50/60 dark:bg-red-500/[0.06]",
        isCompleting && "task-row-completing",
        isClickable && "cursor-pointer"
      )}
      onClick={isClickable ? (e) => { e.stopPropagation(); onItemClick!(item); } : undefined}
      title={isClickable ? "Открыть" : undefined}
    >
      {/* Checkbox / icon */}
      <div className="shrink-0" onClick={isClickable ? (e) => e.stopPropagation() : undefined}>
        {kind === "event" && item.meta?.completion_mode === "manual" && onCompleteEvent ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCompleteEvent(item); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center touch-manipulation"
          >
            {isDone
              ? <CheckCircle2 size={16} className="text-emerald-500" />
              : <Circle size={16} className="text-slate-400 hover:text-indigo-500 transition-colors" />
            }
          </button>
        ) : kind === "event" ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className="text-[14px]">📅</span>
          </div>
        ) : canComplete ? (
          <button
            onClick={(e) => { e.stopPropagation(); if (!isCompleting) onComplete(item); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="relative w-5 h-5 flex items-center justify-center touch-manipulation"
          >
            <span className={clsx(
              "w-[16px] h-[16px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all",
              kind === "habit" ? "border-violet-400" : isOverdue ? "border-red-400" : "border-indigo-400/60 dark:border-slate-500",
              (isCompleting && kind !== "habit") && "task-check-completing"
            )}>
              {(isCompleting && kind !== "habit") && <span className="task-check-mark" aria-hidden="true">✓</span>}
            </span>
          </button>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className={clsx(
              "w-[16px] h-[16px] rounded-[5px] border-[1.5px] flex items-center justify-center",
              isDone ? "bg-emerald-500 border-emerald-500" : "border-slate-200"
            )}>
              {isDone && <span className="text-[#fff] text-[7px] font-bold">✓</span>}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
        <span
          className={clsx("task-title-text text-[14px] md:text-[15px] font-medium leading-snug", isDone && "line-through decoration-slate-300 dark:decoration-white/20")}
          style={{ color: isDone ? "var(--t-muted)" : "var(--t-primary)" }}
          title={title}
        >
          {title}
        </span>
        {categoryName && <CategoryChip name={categoryName} emoji={item.category_emoji} />}
        {kind === "event" && item.meta?.person_age != null && (
          <span className={clsx(
            "text-[11px] font-semibold shrink-0",
            item.meta.is_jubilee ? "text-amber-400" : "text-pink-400",
          )}>
            {item.meta.is_jubilee ? "🎉 " : ""}{String(item.meta.person_age)} {pluralizeYears(item.meta.person_age as number)}
          </span>
        )}
        {/* Habit streak */}
        {kind === "habit" && Boolean(item.meta?.current_streak) && (
          isDone ? (
            <span className="text-[11px] font-medium shrink-0 tabular-nums" style={{ color: "var(--t-muted)" }}>
              {String(item.meta.current_streak)} дн.
            </span>
          ) : (
            <span className="text-[11px] font-semibold shrink-0 tabular-nums text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-1.5 py-0.5 rounded">
              {String(item.meta.current_streak)} дн.
            </span>
          )
        )}
        {reminders.length > 0 && !isDone && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/10 dark:bg-indigo-400/10 tabular-nums shrink-0"
            style={{ fontSize: "11px", color: "var(--t-muted)" }}
            title={`Напоминания: ${reminders.join(", ")}`}
          >
            <Bell size={9} strokeWidth={2.2} className="opacity-70" />
            {reminders.join(" · ")}
          </span>
        )}
        {timeStr && (
          <span className="text-[11px] font-medium tabular-nums shrink-0 ml-auto" style={{ color: "var(--t-muted)" }}>
            {timeStr}
          </span>
        )}
      </div>
    </div>
  );
}



const SENTINEL_ID = "__dnd-end-sentinel__";

/**
 * Drop zone at the very end of the list — registered as a plain droppable (NOT sortable)
 * so verticalListSortingStrategy isn't confused by it.
 * Non-zero height is needed so closestCenter can detect it.
 */
function SentinelDropZone() {
  const { setNodeRef, active } = useDroppable({ id: SENTINEL_ID });
  return <div ref={setNodeRef} style={{ height: active ? 12 : 0 }} aria-hidden />;
}

/** Drag-and-drop wrapper for a single task row (kind === "task" only). */
function SortableTaskItem({
  item,
  onComplete,
  isCompleting,
  onItemClick,
}: {
  item: DashboardItem;
  onComplete: (item: DashboardItem) => void;
  isCompleting?: boolean;
  onItemClick?: (item: DashboardItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={item.is_done ? "opacity-70" : undefined}>
      <Item
        item={item}
        onComplete={onComplete}
        isCompleting={isCompleting}
        dragHandleProps={{ ...attributes, ...listeners }}
        onItemClick={onItemClick}
      />
    </div>
  );
}

function FinanceItem({ op, onClick, onSkip }: { op: UpcomingPayment; onClick: () => void; onSkip: () => void }) {
  const isOverdue = op.days_until < 0;
  return (
    <div className={clsx(
      "group/fi flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1",
      isOverdue && "bg-red-50/60 dark:bg-red-500/[0.06]"
    )}>
      <div className={clsx(
        "w-[16px] h-[16px] rounded-[5px] border-[1.5px] shrink-0",
        isOverdue ? "border-red-400" : "border-indigo-300/60 dark:border-white/20"
      )} />
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left flex flex-wrap items-center gap-1.5"
      >
        <span className="text-[14px] md:text-[15px] font-medium" style={{ color: "var(--t-primary)" }}>
          {op.title}
        </span>
        <span className="text-[11px] font-medium tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>
          {op.amount_formatted}
        </span>
      </button>
      <Tooltip content="Выполнить">
        <button
          onClick={onClick}
          className="md:opacity-0 md:group-hover/fi:opacity-100 flex items-center gap-0.5 px-2 py-1 rounded-md bg-indigo-100 dark:bg-indigo-600/20 hover:bg-indigo-200 dark:hover:bg-indigo-600/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold transition-all shrink-0 touch-manipulation"
        >
          <Play size={9} className="fill-current" />
        </button>
      </Tooltip>
      <Tooltip content="Пропустить">
        <button
          onClick={onSkip}
          className="md:opacity-0 md:group-hover/fi:opacity-100 w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500 dark:hover:text-red-400 shrink-0 touch-manipulation"
          style={{ color: "var(--t-faint)" }}
        >
          <SkipForward size={12} />
        </button>
      </Tooltip>
    </div>
  );
}

const ZOMBIE_DAYS = 3;

function getDaysOverdue(item: DashboardItem): number {
  if (!item.is_overdue || !item.date) return 0;
  const due = new Date(item.date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}


const GROUP_META: Record<string, { Icon: LucideIcon; color: string }> = {
  tasks:   { Icon: ListChecks,   color: "#4F46E5" },
  habits:  { Icon: Repeat2,      color: "#7C3AED" },
  events:  { Icon: CalendarDays, color: "#4F46E5" },
  finance: { Icon: Wallet,       color: "#4F46E5" },
};

function GroupHeader({ label, groupKey }: { label: string; groupKey?: string }) {
  const meta = groupKey ? GROUP_META[groupKey] : undefined;
  const Icon = meta?.Icon;
  const color = meta?.color ?? "var(--t-secondary)";
  return (
    <div className="flex items-center gap-[7px] pt-3 pb-1 first:pt-0.5">
      {Icon && <Icon size={14} strokeWidth={2.1} style={{ color }} />}
      <p className="text-[12.5px] font-semibold tracking-[-0.005em]" style={{ color }}>{label}</p>
    </div>
  );
}


function QuickAddTaskRow() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: createTask, isPending } = useCreateTask();

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 3000);
  }, []);

  function getTodayISO(): string {
    // Use local date in YYYY-MM-DD format (matches Moscow timezone in browser)
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function submit() {
    if (isPending) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask(
      { title: trimmed, due_kind: "DATE", due_date: getTodayISO() },
      {
        onSuccess: () => {
          setTitle("");
          inputRef.current?.focus();
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error ? err.message : "Не удалось создать задачу";
          showError(msg);
        },
      }
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="mt-2.5">
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors focus-within:border-indigo-400/70"
        style={{
          borderColor: "rgba(99,102,241,0.22)",
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <button
          onClick={submit}
          disabled={isPending || !title.trim()}
          aria-label="Добавить задачу на сегодня"
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors disabled:opacity-40"
          style={{ color: isPending ? "var(--t-faint)" : "var(--t-muted)" }}
        >
          {isPending ? (
            <span className="text-[11px] animate-pulse">•••</span>
          ) : (
            <span className="text-[17px] leading-none font-light" style={{ color: "var(--t-muted)" }}>+</span>
          )}
        </button>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder="Быстро добавить на сегодня…"
          aria-label="Быстро добавить задачу на сегодня"
          className="flex-1 bg-transparent outline-none text-[15px] placeholder:opacity-50 disabled:opacity-60"
          style={{
            color: "var(--t-primary)",
            fontSize: "var(--fs-body, 15px)",
          }}
        />
      </div>
      {error && (
        <p
          className="mt-1 text-[13px] font-medium px-1"
          style={{ color: "#ef4444" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function TodayBlock({ today, plannedOps }: Props) {
  const { overdue, active, done, events, progress } = today;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const todayLabel = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const [executeOp, setExecuteOp] = useState<UpcomingPayment | null>(null);
  const [confirmItem, setConfirmItem] = useState<DashboardItem | null>(null);
  const [detailItem, setDetailItem] = useState<DashboardItem | null>(null);
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const completingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showDone, setShowDone] = useState(false);

  // Create menu (dropdown: task / operation) — desktop only
  // Cleanup timer on unmount
  useEffect(() => { return () => { if (completingTimerRef.current) clearTimeout(completingTimerRef.current); }; }, []);

  function handleTodayCompleted(kind: "task" | "habit" | "task_occ", id: number) {
    if (kind === "habit") { qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["plan"] }); return; } // habits: immediate invalidate, they have their own animation
    const key = kind + "-" + id;
    setCompletingKey(key);
    if (completingTimerRef.current) clearTimeout(completingTimerRef.current);
    completingTimerRef.current = setTimeout(() => { setCompletingKey(null); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["plan"] }); }, 450);
  }

  function handleOpenCompleteItem(item: DashboardItem) {
    if (completingKey === item.kind + "-" + item.id) return;
    setConfirmItem(item);
  }

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);
  const createBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (createBtnRef.current && !createBtnRef.current.contains(e.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setCreateMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [createMenuOpen]);

  const showTomorrow = useMemo(() => {
    const hasActiveTasks =
      (overdue ?? []).some((i) => i.kind === "task" || i.kind === "task_occ") ||
      (active ?? []).some((i) => i.kind === "task" || i.kind === "task_occ");
    const hasActivePlannedOps = (plannedOps ?? []).length > 0;
    return !hasActiveTasks && !hasActivePlannedOps;
  }, [overdue, active, plannedOps]);

  function getTomorrowISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const { data: tomorrowPlan } = useQuery({
    queryKey: ["plan", "tomorrow", getTomorrowISO()],
    queryFn: () => api.get<{ day_groups: { date_label: string; entries: { id: number; kind: string; title: string; time: string | null; is_done: boolean; is_overdue: boolean; category_emoji: string | null; category_title: string | null; meta: Record<string, unknown> }[] }[] }>(`/api/v2/plan?start_date=${getTomorrowISO()}&range=1`),
    enabled: showTomorrow,
    staleTime: 60_000,
  });

  const tomorrowGroup = tomorrowPlan?.day_groups?.[0];
  const tomorrowEntries = tomorrowGroup?.entries ?? [];

  const isEvening = useMemo(() => new Date().getHours() >= 18, []);

  const { activeTasks, doneTasks, activeHabits, doneHabits, doneOps, isEmpty } = useMemo(() => {
    const _activeTasks = [
      ...(overdue ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
      ...(active ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
    ];
    const _doneTasks = (done ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ");
    const _activeHabits = [
      ...(overdue ?? []).filter((i) => i.kind === "habit"),
      ...(active ?? []).filter((i) => i.kind === "habit"),
    ];
    const _doneHabits = (done ?? []).filter((i) => i.kind === "habit");
    const _doneOps = (done ?? []).filter((i) => i.kind === "planned_op");
    const _isEmpty =
      _activeTasks.length === 0 && _doneTasks.length === 0 &&
      _activeHabits.length === 0 && _doneHabits.length === 0 &&
      _doneOps.length === 0 &&
      (events ?? []).length === 0 &&
      (plannedOps ?? []).length === 0;
    return { activeTasks: _activeTasks, doneTasks: _doneTasks, activeHabits: _activeHabits, doneHabits: _doneHabits, doneOps: _doneOps, isEmpty: _isEmpty };
  }, [overdue, active, done, events, plannedOps]);

  const qc = useQueryClient();
  const { mutate: incrementHabit } = useIncrementHabitToday();
  const { mutate: decrementHabit } = useDecrementHabitToday();
  const { mutate: completeEvent } = useCompleteEvent();
  const { mutate: uncompleteEvent } = useUncompleteEvent();

  function handleCompleteEvent(item: DashboardItem) {
    const occurrenceId = item.meta?.occurrence_id as number | undefined;
    if (!occurrenceId) return;
    if (item.is_done) {
      uncompleteEvent(occurrenceId);
    } else {
      completeEvent(occurrenceId);
    }
  }

  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });

  const { mutate: reorderTasks } = useReorderTasks();

  // Local order for optimistic DnD -- mirrors activeTasks, updated on drag
  const [localTaskOrder, setLocalTaskOrder] = useState<DashboardItem[]>([]);
  // Ref instead of state: changing it does NOT trigger re-renders or the useEffect
  const isDraggingRef = useRef(false);

  // Sync from server only when activeTasks changes and we're not mid-drag.
  // Using a ref guard (not state) so that drag-end doesn't immediately reset
  // the local order before the server responds to the reorder mutation.
  useEffect(() => {
    if (!isDraggingRef.current) setLocalTaskOrder(activeTasks);
  }, [activeTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(_event: DragStartEvent) {
    isDraggingRef.current = true;
  }

  // Update order live during drag — this is what makes every drop position work reliably.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalTaskOrder((prev) => {
      const oldIndex = prev.findIndex((t) => t.id === active.id);
      if (oldIndex === -1) return prev;

      let newIndex: number;
      if (over.id === SENTINEL_ID) {
        // Pointer is past the last item — move dragged item to the very end
        newIndex = prev.length - 1;
      } else {
        newIndex = prev.findIndex((t) => t.id === over.id);
        if (newIndex === -1) return prev;
      }

      if (oldIndex === newIndex) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event;

    if (!over) {
      isDraggingRef.current = false;
      setLocalTaskOrder(activeTasks);
      return;
    }

    const taskIds = localTaskOrder
      .filter((t) => t.kind === "task")
      .map((t) => t.id);

    if (taskIds.length === 0) {
      isDraggingRef.current = false;
      return;
    }

    // Keep isDraggingRef true until the server confirms — prevents an
    // in-flight dashboard refetch from overwriting the local order.
    reorderTasks(taskIds, {
      onError: () => {
        isDraggingRef.current = false;
        setLocalTaskOrder(activeTasks);
      },
      onSettled: () => {
        isDraggingRef.current = false;
      },
    });
  }

  // IDs for SortableContext — only real draggable task items.
  // SENTINEL_ID is a plain useDroppable, not in this array, so verticalListSortingStrategy
  // isn't confused by it.
  const sortableIds = localTaskOrder
    .filter((t) => t.kind === "task" && !t.is_done)
    .map((t) => t.id);

  return (
    <>
      {executeOp && (
        <CreateOperationModal
          occurrenceId={executeOp.occurrence_id}
          initialValues={{
            opType: executeOp.kind as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
            amount: String(executeOp.amount),
            walletId: executeOp.wallet_id ?? undefined,
            fromWalletId: executeOp.wallet_id ?? undefined,
            toWalletId: executeOp.destination_wallet_id ?? undefined,
            categoryId: executeOp.category_id ?? undefined,
          }}
          onClose={() => setExecuteOp(null)}
        />
      )}
      {confirmItem && isCompletable(confirmItem.kind) && (
        <ConfirmCompleteModal
          kind={confirmItem.kind as CompletableKind}
          id={confirmItem.id}
          title={confirmItem.title}
          onClose={() => setConfirmItem(null)}
          onCompleted={handleTodayCompleted}
        />
      )}
      {detailItem && (detailItem.kind === "task" || detailItem.kind === "task_occ" || detailItem.kind === "event") && (
        <EntryDetailModal
          entry={{
            id: detailItem.id,
            kind: detailItem.kind,
            title: detailItem.title,
            date: detailItem.date,
            time: detailItem.time,
            is_done: detailItem.is_done,
            is_overdue: detailItem.is_overdue,
            category_emoji: detailItem.category_emoji,
            meta: detailItem.meta,
          }}
          onClose={() => { setDetailItem(null); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["plan"] }); }}
        />
      )}
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
{showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}

      <div
        className="rounded-xl md:rounded-2xl border p-3.5 md:p-5 relative"
        style={
          today.vacation
            ? {
                borderColor: "rgba(6,182,212,0.35)",
                background: "linear-gradient(135deg, rgba(6,182,212,0.20), rgba(251,191,36,0.14))",
              }
            : {
                borderColor: "rgba(99,102,241,0.25)",
                background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))",
              }
        }
      >
        {/* Header */}
        <div className="mb-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline flex-wrap gap-x-2">
                <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight" style={{ color: "var(--t-primary)" }}>
                  Сегодня
                </h2>
                <span className="text-[12px] md:text-[13px] font-medium" style={{ color: "var(--t-faint)" }}>
                  {todayLabel}
                </span>
              </div>
              {progress.total > 0 && (
                <p className="text-[13px] md:text-[14px] font-medium mt-0.5" style={{ color: "var(--t-muted)" }}>
                  {progress.done} из {progress.total} выполнено
                </p>
              )}
            </div>

          {/* Create menu — desktop only */}
          <div ref={createBtnRef} className="relative hidden md:block shrink-0">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={14} strokeWidth={2.2} />}
              onClick={() => setCreateMenuOpen((v) => !v)}
              aria-label="Создать"
              aria-expanded={createMenuOpen}
            >
              Создать
            </Button>

            {createMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border shadow-xl overflow-hidden"
                style={{
                  background: "var(--t-card-bg, #ffffff)",
                  borderColor: "rgba(0,0,0,0.08)",
                }}
              >
                <button
                  onClick={() => { setCreateMenuOpen(false); setShowTaskModal(true); }}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  style={{ color: "var(--t-primary)" }}
                >
                  Задача
                </button>
                <button
                  onClick={() => { setCreateMenuOpen(false); setShowOpModal(true); }}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  style={{ color: "var(--t-primary)" }}
                >
                  Операция
                </button>
              </div>
            )}
          </div>
          </div>

          {/* Progress bar — full width, below the header row */}
          {progress.total > 0 && (
            <div className="mt-2 h-[6px] rounded-full overflow-hidden" style={{ background: "rgba(99,102,241,0.12)" }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100
                    ? "linear-gradient(90deg, #10b981, #34d399)"
                    : "linear-gradient(90deg, #6366f1, #818cf8)",
                  boxShadow: progressPct === 100
                    ? "0 0 10px rgba(16,185,129,0.45)"
                    : "0 0 10px rgba(99,102,241,0.4)",
                }}
              />
            </div>
          )}
        </div>

        {/* Holiday banner — today is a federal RF holiday */}
        {today.holiday && (() => {
          const t = HOLIDAY_THEME_CLS[today.holiday.theme] ?? HOLIDAY_THEME_CLS.winter;
          return (
            <div
              className={clsx(
                "mt-2 mb-1.5 px-3 py-2 rounded-lg border flex items-center gap-2",
                t.bg, t.border
              )}
              title={today.holiday.name}
            >
              <span className="text-[18px] leading-none shrink-0">{today.holiday.icon}</span>
              <span className={clsx("text-[13px] font-semibold", t.text)}>
                {today.holiday.name}
              </span>
            </div>
          );
        })()}

        {/* Vacation banner */}
        {today.vacation && (() => {
          const endISO = today.vacation_end;
          let label = "Отпуск — отдыхайте!";
          if (endISO) {
            const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
            const endMidnight = new Date(endISO + "T00:00:00");
            const daysLeft = Math.round((endMidnight.getTime() - todayMidnight.getTime()) / 86_400_000);
            if (daysLeft === 0) {
              label = "Отпуск · последний день — наслаждайтесь!";
            } else {
              const mod10 = daysLeft % 10, mod100 = daysLeft % 100;
              const word = (mod100 >= 11 && mod100 <= 14) ? "дней"
                : mod10 === 1 ? "день"
                : mod10 >= 2 && mod10 <= 4 ? "дня"
                : "дней";
              label = `Отпуск · ещё ${daysLeft} ${word}`;
            }
          }
          return (
            <div className="mt-2 mb-1.5 px-3 py-2 rounded-lg border flex items-center gap-2 bg-cyan-50 dark:bg-cyan-500/[0.08] border-cyan-300/60 dark:border-cyan-500/25">
              <span className="text-[18px] leading-none shrink-0">🏖️</span>
              <span className="text-[13px] font-semibold text-cyan-700 dark:text-cyan-300">{label}</span>
            </div>
          );
        })()}

        {/* ── Grouped sections ── */}
        {(() => {
          const allTasks = [...localTaskOrder, ...(showDone ? doneTasks : [])];
          const allHabits = [...activeHabits, ...(showDone ? doneHabits : [])];
          const eventItems = events ?? [];
          const finOps = plannedOps ?? [];
          const completedOps = showDone ? doneOps : [];

          const doneItems = [...doneTasks, ...doneHabits, ...doneOps];
          const hiddenDoneCount = showDone ? 0 : doneItems.length;

          const groups: { key: string; label: string; content: React.ReactNode }[] = [];

          if (allTasks.length > 0) {
            groups.push({
              key: "tasks",
              label: "Задачи",
              content: (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {allTasks.map((item) => {
                      const rescheduleCount = (item.meta?.reschedule_count as number) ?? 0;
                      const isZombie = item.kind === "task" && !item.is_done && (getDaysOverdue(item) >= ZOMBIE_DAYS || rescheduleCount >= ZOMBIE_DAYS);
                      return item.kind === "task" && !item.is_done ? (
                        <div key={`${item.kind}-${item.id}`} className={isZombie ? "rounded-lg border border-amber-400/40 bg-amber-50/30 dark:bg-amber-500/5 -mx-1 px-1 mb-0.5" : undefined}>
                          <SortableTaskItem
                            item={item}
                            onComplete={handleOpenCompleteItem}
                            isCompleting={completingKey === (item.kind + "-" + item.id)}
                            onItemClick={setDetailItem}
                          />
                        </div>
                      ) : (
                        <div key={`${item.kind}-${item.id}`} className={item.is_done ? "opacity-70" : undefined}>
                          <Item item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} onItemClick={setDetailItem} />
                        </div>
                      );
                    })}
                    <SentinelDropZone />
                  </SortableContext>
                </DndContext>
              ),
            });
          }

          if (allHabits.length > 0) {
            groups.push({
              key: "habits",
              label: "Привычки",
              content: allHabits.map((item) => {
                const streakAtRisk = isEvening && !item.is_done && ((item.meta?.current_streak as number) ?? 0) > 0;
                const isCounter = item.meta?.habit_type === "counter";
                const habitId = item.meta?.habit_id as number | undefined;
                const count = (item.meta?.completion_count as number) ?? 0;
                const target = (item.meta?.target_count as number) ?? 1;
                const unitLabel = item.meta?.unit_label as string | null | undefined;

                if (isCounter && habitId) {
                  return (
                    <div key={`${item.kind}-${item.id}`} className={clsx(item.is_done && "opacity-70", streakAtRisk && "rounded-lg border border-amber-400/40 bg-amber-50/30 dark:bg-amber-500/5 -mx-1 px-1 mb-0.5")}>
                      <div className="flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1 group/ch">
                        {/* +1 button or done check */}
                        <div className="shrink-0">
                          {item.is_done ? (
                            <div className="w-5 h-5 flex items-center justify-center">
                              <span className="w-[16px] h-[16px] rounded-[5px] bg-emerald-500 border-emerald-500 border-[1.5px] flex items-center justify-center">
                                <span className="text-[#fff] text-[7px] font-bold">✓</span>
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => incrementHabit(habitId)}
                              className="w-5 h-5 flex items-center justify-center touch-manipulation rounded-[5px] border-[1.5px] border-violet-400 hover:bg-violet-500/15 transition-colors text-violet-400 text-[10px] font-bold"
                              aria-label="+1"
                            >
                              +
                            </button>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] md:text-[15px] font-medium leading-snug" style={{ color: item.is_done ? "var(--t-muted)" : "var(--t-primary)" }}>
                            {item.title}
                          </span>
                          <span className={clsx(
                            "text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded border",
                            item.is_done
                              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                              : "text-violet-400 bg-violet-500/10 border-violet-500/20"
                          )}>
                            {count}/{target}{unitLabel ? ` ${unitLabel}` : ""}
                          </span>
                        </div>
                        {/* Decrement button */}
                        {count > 0 && (
                          <button
                            onClick={() => decrementHabit(habitId)}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover/ch:opacity-100 transition-all hover:bg-white/[0.08]"
                            style={{ color: "var(--t-faint)" }}
                            aria-label="Отменить +1"
                          >
                            <Minus size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={`${item.kind}-${item.id}`} className={clsx(item.is_done && "opacity-70", streakAtRisk && "rounded-lg border border-amber-400/40 bg-amber-50/30 dark:bg-amber-500/5 -mx-1 px-1 mb-0.5")}>
                    <Item item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} />
                  </div>
                );
              }),
            });
          }

          if (eventItems.length > 0) {
            groups.push({
              key: "events",
              label: "События",
              content: eventItems.map((item) => (
                <Item key={`${item.kind}-${item.id}`} item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} onItemClick={setDetailItem} onCompleteEvent={handleCompleteEvent} />
              )),
            });
          }

          if (finOps.length > 0 || completedOps.length > 0) {
            groups.push({
              key: "finance",
              label: "Финансы",
              content: (
                <>
                  {finOps.map((op) => (
                    <FinanceItem key={op.occurrence_id} op={op} onClick={() => setExecuteOp(op)} onSkip={() => skipOp(op.occurrence_id)} />
                  ))}
                  {completedOps.map((item) => (
                    <div key={`done-op-${item.id}`} className="opacity-70">
                      <Item item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} />
                    </div>
                  ))}
                </>
              ),
            });
          }

          return (
            <>
              {groups.map((g) => (
                <div key={g.key}>
                  <GroupHeader label={g.label} groupKey={g.key} />
                  {g.content}
                </div>
              ))}

              {/* Show/hide done toggle */}
              {!showDone && hiddenDoneCount > 0 && (
                <button
                  onClick={() => setShowDone(true)}
                  className="w-full text-center py-1.5 text-[11px] font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400 touch-manipulation"
                  style={{ color: "var(--t-faint)" }}
                >
                  + ещё {hiddenDoneCount} выполненных
                </button>
              )}
              {showDone && doneItems.length > 0 && (
                <button
                  onClick={() => setShowDone(false)}
                  className="w-full text-center py-1 text-[10px] font-medium transition-colors hover:text-indigo-600 dark:hover:text-indigo-400"
                  style={{ color: "var(--t-faint)" }}
                >
                  Скрыть выполненные
                </button>
              )}
            </>
          );
        })()}

        {/* Tomorrow section — shown when all tasks and planned ops for today are done */}
        {showTomorrow && tomorrowEntries.length > 0 && (() => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const dateLabel = tomorrow.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
          const byKind: Record<string, typeof tomorrowEntries> = {};
          for (const e of tomorrowEntries) {
            (byKind[e.kind] ??= []).push(e);
          }
          const sectionLabels: Record<string, string> = { task: "Задачи", task_occ: "Задачи", event: "События", planned_op: "Финансы", habit: "Привычки" };
          const kindToGroup: Record<string, string> = { task: "tasks", task_occ: "tasks", event: "events", planned_op: "finance", habit: "habits" };
          const kindOrder = ["task", "task_occ", "event", "planned_op", "habit"];
          const sections = kindOrder.filter((k) => byKind[k]?.length);

          return (
            <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "var(--t-faint)" }}>
                Ожидает завтра · {dateLabel}
              </p>
              <div className="opacity-60 space-y-0">
                {sections.map((kind) => (
                  <div key={kind}>
                    <GroupHeader label={sectionLabels[kind]} groupKey={kindToGroup[kind]} />
                    {byKind[kind].map((e) => (
                      <Item
                        key={`tomorrow-${kind}-${e.id}`}
                        item={{
                          id: e.id,
                          kind: e.kind,
                          title: e.title,
                          date: null as unknown as string,
                          time: e.time,
                          is_done: false,
                          is_overdue: false,
                          category_emoji: e.category_emoji,
                          category_name: e.category_title,
                          meta: e.meta ?? {},
                        }}
                        onComplete={() => {}}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Quick-add task */}
        <QuickAddTaskRow />

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center gap-1.5 py-5 text-center">
            <CheckCircle2 size={24} className="text-indigo-400/30" />
            <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>На сегодня ничего не запланировано</p>
          </div>
        )}
      </div>
    </>
  );
}
