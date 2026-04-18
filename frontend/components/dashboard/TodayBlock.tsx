"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { clsx } from "clsx";
import { CheckCircle2, SkipForward, Play, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
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
import { isCompletable, type CompletableKind } from "@/lib/completion";
import type { TodayBlock as TodayBlockType, DashboardItem, UpcomingPayment } from "@/types/api";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { EntryDetailModal } from "@/components/modals/EntryDetailModal";

interface Props {
  today: TodayBlockType;
  plannedOps: UpcomingPayment[];
}

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

function CategoryChip({ name }: { name: string }) {
  const colorCls = categoryColorClass(name);
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold tracking-tight leading-none shrink-0 ${colorCls}`}>
      {name}
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
}: {
  item: DashboardItem;
  onComplete: (item: DashboardItem) => void;
  isCompleting?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onItemClick?: (item: DashboardItem) => void;
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
        isCompleting && "task-row-completing",
        isClickable && "cursor-pointer"
      )}
      onClick={isClickable ? (e) => { e.stopPropagation(); onItemClick!(item); } : undefined}
      title={isClickable ? "Открыть" : undefined}
    >
      {/* Checkbox / icon */}
      <div className="shrink-0" onClick={isClickable ? (e) => e.stopPropagation() : undefined}>
        {kind === "event" ? (
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
              "w-[16px] h-[16px] rounded-full border-[1.5px] flex items-center justify-center transition-all",
              kind === "habit" ? "border-violet-400 rounded-[3px]" : isOverdue ? "border-red-400" : "border-indigo-400/60 dark:border-slate-500",
              (isCompleting && kind !== "habit") && "task-check-completing"
            )}>
              {(isCompleting && kind !== "habit") && <span className="task-check-mark" aria-hidden="true">✓</span>}
            </span>
          </button>
        ) : (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] flex items-center justify-center",
              isDone ? "bg-emerald-500 border-emerald-500" : "border-slate-200"
            )}>
              {isDone && <span className="text-white text-[7px] font-bold">✓</span>}
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
        {isOverdue && !isDone && (
          <span className="text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 py-px rounded shrink-0">
            просроч.
          </span>
        )}
        {categoryName && <CategoryChip name={categoryName} />}
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
          <span className="text-[9px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
            {reminders.join(", ")}
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
  return (
    <div className="group/fi flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1">
      <div className="w-[16px] h-[16px] rounded-full border-[1.5px] border-indigo-300/60 dark:border-white/20 shrink-0" />
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
      <button
        onClick={onClick}
        className="md:opacity-0 md:group-hover/fi:opacity-100 flex items-center gap-0.5 px-2 py-1 rounded-md bg-indigo-100 dark:bg-indigo-600/20 hover:bg-indigo-200 dark:hover:bg-indigo-600/40 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold transition-all shrink-0 touch-manipulation"
        title="Выполнить"
      >
        <Play size={9} className="fill-current" />
      </button>
      <button
        onClick={onSkip}
        className="md:opacity-0 md:group-hover/fi:opacity-100 w-6 h-6 flex items-center justify-center rounded-md transition-all hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-500 dark:hover:text-red-400 shrink-0 touch-manipulation"
        style={{ color: "var(--t-faint)" }}
        title="Пропустить"
      >
        <SkipForward size={12} />
      </button>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-0.5 first:pt-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: "var(--t-muted)", opacity: 0.6 }}>
        {label}
      </p>
      <div className="flex-1 h-px bg-indigo-200/40 dark:bg-white/[0.06]" />
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
  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const { mutate: reorderTasks, isPending: isReordering } = useReorderTasks();

  // Local order for optimistic DnD -- mirrors activeTasks, updated on drag
  const [localTaskOrder, setLocalTaskOrder] = useState<DashboardItem[]>([]);

  // Sync localTaskOrder whenever server data refreshes
  useEffect(() => {
    setLocalTaskOrder(activeTasks);
  }, [activeTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // 5px movement threshold -- distinguishes drag from tap/click
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active: dragActive, over } = event;
    if (!over || dragActive.id === over.id) return;

    const oldIndex = localTaskOrder.findIndex((t) => t.id === dragActive.id);
    const newIndex = localTaskOrder.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(localTaskOrder, oldIndex, newIndex);
    setLocalTaskOrder(newOrder);

    // Send only kind === "task" IDs to backend; task_occ have their own ordering
    const taskIds = newOrder.filter((t) => t.kind === "task").map((t) => t.id);
    if (!isReordering && taskIds.length > 0) {
      reorderTasks(taskIds);
    }
  }

  // IDs used by SortableContext -- only draggable (non-done, kind === "task") items
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
        className="rounded-xl md:rounded-2xl border p-3.5 md:p-5 relative overflow-hidden"
        style={{
          borderColor: "rgba(99,102,241,0.25)",
          background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))",
        }}
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
            <button
              onClick={() => setCreateMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-medium transition-colors bg-indigo-500/15 hover:bg-indigo-500/25"
              style={{ color: "var(--t-primary)" }}
              aria-label="Создать"
              aria-expanded={createMenuOpen}
            >
              <Plus size={14} strokeWidth={2.2} />
              Создать
            </button>

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
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    {allTasks.map((item) =>
                      item.kind === "task" && !item.is_done ? (
                        <SortableTaskItem
                          key={`${item.kind}-${item.id}`}
                          item={item}
                          onComplete={handleOpenCompleteItem}
                          isCompleting={completingKey === (item.kind + "-" + item.id)}
                          onItemClick={setDetailItem}
                        />
                      ) : (
                        <div key={`${item.kind}-${item.id}`} className={item.is_done ? "opacity-70" : undefined}>
                          <Item item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} onItemClick={setDetailItem} />
                        </div>
                      )
                    )}
                  </SortableContext>
                </DndContext>
              ),
            });
          }

          if (allHabits.length > 0) {
            groups.push({
              key: "habits",
              label: "Привычки",
              content: allHabits.map((item) => (
                <div key={`${item.kind}-${item.id}`} className={item.is_done ? "opacity-70" : undefined}>
                  <Item item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} />
                </div>
              )),
            });
          }

          if (eventItems.length > 0) {
            groups.push({
              key: "events",
              label: "События",
              content: eventItems.map((item) => (
                <Item key={`${item.kind}-${item.id}`} item={item} onComplete={handleOpenCompleteItem} isCompleting={completingKey === (item.kind + "-" + item.id)} onItemClick={setDetailItem} />
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
              {groups.map((g, idx) => (
                <div key={g.key}>
                  {idx > 0 && <div className="h-px bg-indigo-200/30 dark:bg-white/[0.05] my-0.5" />}
                  <GroupHeader label={g.label} />
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
