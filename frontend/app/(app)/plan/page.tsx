"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EntryDetailModal } from "@/components/modals/EntryDetailModal";
import { isCompletable, type CompletableKind } from "@/lib/completion";
import { clsx } from "clsx";
import { CalendarDays, Play, SkipForward, Plus, ChevronDown, MoreVertical } from "lucide-react";
import { api } from "@/lib/api";

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

interface DayGroup {
  date: string | null;
  date_label: string;
  is_today: boolean;
  is_overdue_group: boolean;
  entries: PlanEntry[];
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

  const inputCls = "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85";
  const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/50";

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
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold border border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
            style={{ color: "var(--t-secondary)" }}
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving || !date}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      }
    >
      <p className="text-[13px] font-medium mb-3 truncate" style={{ color: "var(--t-primary)" }}>
        {entry.title}
      </p>

      <div className="space-y-3">
        <div>
          <label className={labelCls}>Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Время (необязательно)</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={inputCls}
          />
        </div>
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
  onExecuteOp: () => void;
  onSkipOp: () => void;
}

function RowMenu({
  entry,
  onReschedule,
  onArchiveTask,
  onSkipTaskOcc,
  onExecuteOp,
  onSkipOp,
}: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isTask = entry.kind === 'task';
  const isTaskOcc = entry.kind === 'task_occ';
  const isOp = entry.kind === 'planned_op';

  // No menu for habits, events, and completed entries
  const hasMenu = (isTask || isTaskOcc || isOp) && !entry.is_done;

  // Click-away and Escape — must be declared before any early return (Rules of Hooks)
  useEffect(() => {
    if (!open || !hasMenu) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hasMenu]);

  if (!hasMenu) return null;

  function close() { setOpen(false); }

  function handle(action: () => void) {
    close();
    action();
  }

  const itemCls = 'w-full text-left px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]';
  const normalStyle: React.CSSProperties = { color: 'var(--t-primary)', fontSize: 'var(--fs-sm, 13px)' };
  const dangerStyle: React.CSSProperties = { color: 'rgb(239 68 68)', fontSize: 'var(--fs-sm, 13px)' };

  return (
    <div ref={ref} className='relative'>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={clsx(
          'md:opacity-0 md:group-hover/row:opacity-100 w-6 h-6 flex items-center justify-center rounded transition-all',
          'hover:bg-slate-100 dark:hover:bg-white/[0.08]',
          open && 'opacity-100 bg-slate-100 dark:bg-white/[0.08]'
        )}
        style={{ color: 'var(--t-faint)' }}
        title='Действия'
        aria-haspopup='true'
        aria-expanded={open}
      >
        <MoreVertical size={14} />
      </button>

      {open && (
        <div className='absolute right-0 top-full mt-1 w-44 rounded-xl border shadow-xl z-30 overflow-hidden bg-white dark:bg-[#0f1221] border-slate-200 dark:border-white/[0.08]'>
          {isTask && (
            <>
              <button className={itemCls} style={normalStyle} onMouseDown={() => handle(onReschedule)}>
                <CalendarDays size={13} className='inline mr-2 opacity-60' />
                Перенести
              </button>
              <button className={itemCls} style={dangerStyle} onMouseDown={() => handle(onArchiveTask)}>
                Архивировать
              </button>
            </>
          )}

          {isTaskOcc && (
            <>
              <button className={itemCls} style={normalStyle} onMouseDown={() => handle(onReschedule)}>
                <CalendarDays size={13} className='inline mr-2 opacity-60' />
                Перенести
              </button>
              <button className={itemCls} style={dangerStyle} onMouseDown={() => handle(onSkipTaskOcc)}>
                Пропустить
              </button>
            </>
          )}

          {isOp && (
            <>
              <button className={itemCls} style={normalStyle} onMouseDown={() => handle(onExecuteOp)}>
                <Play size={11} className='inline mr-2 opacity-60 fill-current' />
                Выполнить
              </button>
              <button className={itemCls} style={dangerStyle} onMouseDown={() => handle(onSkipOp)}>
                <SkipForward size={12} className='inline mr-2 opacity-60' />
                Пропустить
              </button>
            </>
          )}
        </div>
      )}
    </div>
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
  onEntryClick,
}: {
  entry: PlanEntry;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onEntryClick?: (entry: PlanEntry) => void;
}) {
  const canComplete = isCompletable(entry.kind) && !entry.is_done;
  const isOp = entry.kind === "planned_op";
  const opKind = entry.meta.op_kind as string | undefined;
  const amountFormatted = entry.meta.amount_formatted as string | undefined;

  return (
    <div className={clsx(
      "flex items-center gap-2.5 py-[7px] border-t first:border-0 transition-colors cursor-default group/row",
      "border-slate-100/70 dark:border-white/[0.05] hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
    )}>
      {/* Checkbox / icon */}
      <div className="shrink-0">
        {canComplete ? (
          <button
            onClick={() => onComplete(entry)}
            className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] transition-all hover:scale-110",
              entry.is_overdue
                ? "border-red-400 hover:bg-red-500/20"
                : "border-slate-300 dark:border-white/30 hover:bg-indigo-500/20 hover:border-indigo-400"
            )}
            title="Отметить как выполненное"
          />
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
            "text-[14px] font-medium leading-snug truncate",
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
          onExecuteOp={() => onExecuteOp(entry)}
          onSkipOp={() => onSkipOp(entry)}
        />
      </div>
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
  onAddTask,
  onEntryClick,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onAddTask: () => void;
  onEntryClick: (entry: PlanEntry) => void;
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

  // Empty day — skip today (dashboard has "Фокус дня")
  if (isEmpty && group.is_today) return null;

  if (isEmpty) {
    return (
      <div className="rounded-xl border px-3 py-3.5 bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold leading-none text-slate-800 dark:text-white/90">
            {label}
          </h3>
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

  return (
    <div className={clsx(
      "rounded-xl border px-3 py-2.5",
      group.is_overdue_group
        ? "bg-red-50/50 dark:bg-red-500/[0.03] border-red-200 dark:border-red-500/25"
        : group.is_today
        ? "bg-indigo-50/40 dark:bg-indigo-500/[0.04] border-indigo-200 dark:border-indigo-500/35"
        : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.06]"
    )}>
      {/* Day header */}
      <div className="flex items-center gap-2 mb-1">
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
            <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onArchiveTask={onArchiveTask} onSkipTaskOcc={onSkipTaskOcc} onEntryClick={onEntryClick} />
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
  onEntryClick,
}: {
  entries: PlanEntry[];
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onArchiveTask: (entry: PlanEntry) => void;
  onSkipTaskOcc: (entry: PlanEntry) => void;
  onEntryClick: (entry: PlanEntry) => void;
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
            <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} onArchiveTask={onArchiveTask} onSkipTaskOcc={onSkipTaskOcc} onEntryClick={onEntryClick} />
          ))}
        </div>
      )}
    </div>
  );
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
  const qc = useQueryClient();

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

  const { data, isLoading, isError } = useQuery<PlanData>({
    queryKey: ["plan", tab, range],
    queryFn: () => api.get<PlanData>(`/api/v2/plan?tab=${tab}&range=${range}`),
    staleTime: 30_000,
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
          onClose={() => {
            setConfirmEntry(null);
            qc.invalidateQueries({ queryKey: ["plan"] });
          }}
        />
      )}

      <AppTopbar title="План" />
      <main className="flex-1 overflow-auto p-3 md:p-6 touch-manipulation">
        <div className="max-w-[860px]">

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

            {/* Period: Неделя / Месяц */}
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

            {/* Add button */}
            <div className="ml-auto relative">
              <button
                onClick={() => setShowAddMenu((v) => !v)}
                onBlur={() => setTimeout(() => setShowAddMenu(false), 150)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-lg px-2.5 py-1.5 transition-colors shadow-sm"
              >
                <Plus size={14} />
                <span className="hidden md:inline">Добавить</span>
                <ChevronDown size={12} className={clsx("transition-transform hidden md:block", showAddMenu && "rotate-180")} />
              </button>
              {showAddMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-40 rounded-xl border shadow-xl z-20 overflow-hidden bg-white dark:bg-[#0f1221] border-slate-200 dark:border-white/[0.08]"
                >
                  <button
                    onMouseDown={() => { setShowAddMenu(false); setCreateTaskDate(""); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                    style={{ color: "var(--t-primary)" }}
                  >
                    Задача
                  </button>
                  <button
                    onMouseDown={() => { setShowAddMenu(false); setCreateEventDate(""); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                    style={{ color: "var(--t-primary)" }}
                  >
                    Событие
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Loading ───────────────────────────────────────────────── */}
          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 dark:bg-white/[0.02] rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить план</p>
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
                className="mt-4 text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                + Создать задачу
              </button>
            </div>
          )}

          {/* ── Done today (collapsible) ──────────────────────────────── */}
          {filteredData && tab === "active" && filteredData.done_today.length > 0 && (
            <DoneTodayBlock
              entries={filteredData.done_today}
              onComplete={setConfirmEntry}
              onReschedule={setRescheduleEntry}
              onExecuteOp={setExecuteEntry}
              onSkipOp={handleSkipOp}
              onArchiveTask={handleArchiveTask}
              onSkipTaskOcc={handleSkipTaskOcc}
              onEntryClick={setDetailEntry}
            />
          )}

          {/* ── Day groups ────────────────────────────────────────────── */}
          {filteredData && (
            <div className="space-y-2">
              {filteredData.day_groups.map((g, i) => (
                <DayGroupCard
                  key={i}
                  group={g}
                  onComplete={setConfirmEntry}
                  onReschedule={setRescheduleEntry}
                  onExecuteOp={setExecuteEntry}
                  onSkipOp={handleSkipOp}
                  onArchiveTask={handleArchiveTask}
                  onSkipTaskOcc={handleSkipTaskOcc}
                  onAddTask={() => setCreateTaskDate(g.date ?? "")}
                  onEntryClick={setDetailEntry}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </>
  );
}
