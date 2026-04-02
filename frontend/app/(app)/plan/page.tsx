"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { clsx } from "clsx";
import { CalendarDays, Play, SkipForward, Plus, ChevronDown, Repeat, Wallet, Calendar, FolderKanban } from "lucide-react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
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
  { value: "archive", label: "Архив" },
] as const;

const RANGES = [
  { value: 1,  label: "День" },
  { value: 7,  label: "Неделя" },
  { value: 30, label: "Месяц" },
  { value: 90, label: "3 мес." },
];

const KIND_LABELS: Record<string, string> = {
  task:       "Задача",
  task_occ:   "Задача",
  event:      "Событие",
  planned_op: "Операция",
  habit:      "Привычка",
  wish:       "Желание",
};

const KIND_COLORS: Record<string, string> = {
  task:       "text-indigo-700 dark:text-indigo-300/70 bg-indigo-100 dark:bg-indigo-500/[0.08]",
  task_occ:   "text-indigo-700 dark:text-indigo-300/70 bg-indigo-100 dark:bg-indigo-500/[0.08]",
  event:      "text-sky-700 dark:text-sky-300/70 bg-sky-100 dark:bg-sky-500/[0.08]",
  planned_op: "text-amber-700 dark:text-amber-300/70 bg-amber-100 dark:bg-amber-500/[0.08]",
  habit:      "text-violet-700 dark:text-violet-300/70 bg-violet-100 dark:bg-violet-500/[0.08]",
  wish:       "text-pink-700 dark:text-pink-300/70 bg-pink-100 dark:bg-pink-500/[0.08]",
};

type CompletableKind = "task" | "habit" | "task_occ";

function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
}

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-[#131b2e] border border-white/[0.10] rounded-2xl shadow-2xl p-5 w-[320px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
            Перенести задачу
          </h3>
          <button
            onClick={onClose}
            className="text-[18px] leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-muted)" }}
          >
            ×
          </button>
        </div>

        <p className="text-[12px] mb-4 truncate" style={{ color: "var(--t-muted)" }}>
          {entry.title}
        </p>

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Дата
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-[13px] font-medium border border-white/[0.10] bg-white/[0.04] focus:outline-none focus:border-indigo-500/60 transition-colors"
              style={{ color: "var(--t-primary)" }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Время (необязательно)
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-[13px] font-medium border border-white/[0.10] bg-white/[0.04] focus:outline-none focus:border-indigo-500/60 transition-colors"
              style={{ color: "var(--t-primary)" }}
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[12px] text-red-400">{error}</p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold border border-white/[0.08] hover:bg-white/[0.04] transition-colors"
            style={{ color: "var(--t-secondary)" }}
          >
            Отмена
          </button>
          <button
            onClick={save}
            disabled={saving || !date}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
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

function EntryRow({
  entry,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
}: {
  entry: PlanEntry;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
}) {
  const canComplete = isCompletable(entry.kind) && !entry.is_done;
  const isTask = entry.kind === "task" || entry.kind === "task_occ";
  const isEvent = entry.kind === "event";
  const isOp = entry.kind === "planned_op";
  const opKind = entry.meta.op_kind as string | undefined;
  const amountFormatted = entry.meta.amount_formatted as string | undefined;

  return (
    <div className={clsx(
      "flex items-start gap-3 py-2.5 border-b last:border-0 rounded-lg px-2 -mx-2 transition-colors cursor-default group/row",
      "border-white/[0.06] hover:bg-white/[0.03]",
      entry.is_done && "opacity-40"
    )}>
      {/* Left indicator */}
      <div className="mt-0.5 shrink-0">
        {canComplete ? (
          <button
            onClick={() => onComplete(entry)}
            className={clsx(
              "w-[18px] h-[18px] rounded-full border-[1.5px] transition-all hover:scale-110",
              entry.is_overdue
                ? "border-red-400/70 hover:bg-red-500/20 hover:border-red-400"
                : "border-white/30 hover:bg-indigo-500/20 hover:border-indigo-400/60"
            )}
            title="Отметить как выполненное"
          />
        ) : entry.is_done && isCompletable(entry.kind) ? (
          <div className="w-[18px] h-[18px] rounded-full bg-indigo-500/40 border-[1.5px] border-indigo-500/50 flex items-center justify-center">
            <span className="text-[9px] text-white/80">✓</span>
          </div>
        ) : isEvent ? (
          <span className="text-[15px] leading-none">📅</span>
        ) : isOp ? (
          <span className="text-[15px] leading-none">💰</span>
        ) : (
          <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-white/20 shrink-0" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={clsx(
            "text-[14px] font-[500] leading-snug",
            entry.is_done ? "line-through" : "",
            entry.is_overdue && !entry.is_done ? "text-red-400/90" : ""
          )} style={{ color: entry.is_done ? "var(--t-muted)" : (entry.is_overdue ? undefined : "var(--t-primary)") }}>
            {entry.category_emoji && <span className="mr-1">{entry.category_emoji}</span>}
            {entry.title}
          </span>
          {entry.time && (
            <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>
              {entry.time}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {/* Kind badge */}
          <span className={clsx(
            "inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-md leading-none",
            KIND_COLORS[entry.kind] ?? "text-white/50 bg-white/[0.06]"
          )}>
            {KIND_LABELS[entry.kind] ?? entry.kind}
          </span>

          {/* Financial amount */}
          {isOp && amountFormatted && (
            <span className={clsx(
              "text-[12px] font-semibold tabular-nums",
              opKind === "INCOME" ? "money-income" : "money-expense"
            )}>
              {opKind === "INCOME" ? "+" : "\u2212"}{amountFormatted} ₽
            </span>
          )}

          {/* Habit streak */}
          {entry.kind === "habit" && Boolean(entry.meta.current_streak) && (
            <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
              🔥 {String(entry.meta.current_streak)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        {entry.is_overdue && !entry.is_done && (
          <span className="text-[10px] font-semibold text-red-400 bg-red-500/[0.12] border border-red-500/20 px-1.5 py-0.5 rounded-md">
            просрочено
          </span>
        )}
        {isTask && !entry.is_done && (
          <button
            onClick={() => onReschedule(entry)}
            className="md:opacity-0 md:group-hover/row:opacity-100 w-7 h-7 flex items-center justify-center rounded-md transition-all hover:bg-indigo-500/20 bg-white/[0.05] md:bg-transparent"
            style={{ color: "var(--t-faint)" }}
            title="Перенести"
          >
            <CalendarDays size={14} />
          </button>
        )}
        {isOp && !entry.is_done && (
          <>
            <button
              onClick={() => onExecuteOp(entry)}
              className="md:opacity-0 md:group-hover/row:opacity-100 flex items-center gap-1 px-2 py-1.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[10px] font-semibold transition-all"
              title="Выполнить операцию"
            >
              <Play size={9} className="fill-current" />
              <span className="hidden md:inline">Выполнить</span>
            </button>
            <button
              onClick={() => onSkipOp(entry)}
              className="md:opacity-0 md:group-hover/row:opacity-100 w-7 h-7 flex items-center justify-center rounded-md transition-all hover:bg-red-500/15 hover:text-red-400 bg-white/[0.05] md:bg-transparent"
              style={{ color: "var(--t-faint)" }}
              title="Пропустить"
            >
              <SkipForward size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DayGroupCard({
  group,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
  onAddTask,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
  onAddTask: () => void;
}) {
  const label = group.date && !group.is_overdue_group
    ? formatDayHeader(group.date)
    : group.date_label;

  return (
    <div className={clsx(
      "rounded-[14px] border p-4",
      group.is_overdue_group
        ? "bg-red-500/[0.03] border-red-500/25"
        : group.is_today
        ? "border-indigo-500/35"
        : "border-white/[0.06]",
      !group.is_overdue_group && !group.is_today && "bg-white/[0.03]",
      group.is_today && "bg-indigo-500/[0.04]"
    )}>
      {/* Day header */}
      <div className="flex items-center gap-2.5 mb-3">
        <h3 className={clsx(
          "text-[14px] font-semibold leading-none",
          group.is_overdue_group ? "text-red-400/85"
            : group.is_today ? "text-indigo-300/90"
            : "text-white/90"
        )}>
          {label}
          {group.is_today && (
            <span className="ml-2 text-[11px] font-medium text-indigo-400/60 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
              сегодня
            </span>
          )}
        </h3>
        <span className="text-[11px] font-medium bg-white/[0.06] px-1.5 py-0.5 rounded-full tabular-nums" style={{ color: "var(--t-muted)" }}>
          {group.entries.length}
        </span>
      </div>

      {/* Entries */}
      {group.entries.map((e) => (
        <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} />
      ))}

      {/* Per-day quick-add */}
      {(group.is_today || !group.is_overdue_group) && (
        <button
          onClick={onAddTask}
          className="mt-2 flex items-center gap-1.5 text-[12px] font-medium px-2 py-1.5 rounded-lg w-full text-left transition-colors hover:bg-white/[0.04]"
          style={{ color: "var(--t-faint)" }}
        >
          <span className="text-[16px] leading-none opacity-60">+</span>
          Добавить задачу
        </button>
      )}
    </div>
  );
}

function DoneTodayBlock({
  entries,
  onComplete,
  onReschedule,
  onExecuteOp,
  onSkipOp,
}: {
  entries: PlanEntry[];
  onComplete: (entry: PlanEntry) => void;
  onReschedule: (entry: PlanEntry) => void;
  onExecuteOp: (entry: PlanEntry) => void;
  onSkipOp: (entry: PlanEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.06] mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-emerald-400 text-[13px]">✓</span>
        <span className="text-[12px] font-medium" style={{ color: "var(--t-faint)" }}>
          Выполнено сегодня
        </span>
        <span className="text-[12px] font-bold tabular-nums text-emerald-400">{entries.length}</span>
        <ChevronDown
          size={13}
          className={clsx("ml-auto transition-transform", expanded && "rotate-180")}
          style={{ color: "var(--t-faint)" }}
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-white/[0.05]">
          {entries.map((e) => (
            <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={onComplete} onReschedule={onReschedule} onExecuteOp={onExecuteOp} onSkipOp={onSkipOp} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlanPage() {
  const [tab, setTab] = useState<"active" | "done" | "archive">("active");
  const [range, setRange] = useState(7);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<PlanEntry | null>(null);
  const [rescheduleEntry, setRescheduleEntry] = useState<PlanEntry | null>(null);
  const [executeEntry, setExecuteEntry] = useState<PlanEntry | null>(null);
  const qc = useQueryClient();

  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan"] }),
  });

  function handleSkipOp(entry: PlanEntry) {
    const occurrenceId = entry.meta.occurrence_id as number | undefined;
    if (occurrenceId) skipOp(occurrenceId);
  }

  const { data, isLoading, isError } = useQuery<PlanData>({
    queryKey: ["plan", tab, range],
    queryFn: () => api.get<PlanData>(`/api/v2/plan?tab=${tab}&range=${range}`),
    staleTime: 30_000,
  });

  const summary = data?.summary;

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
      {showCreateTask && <CreateTaskModal onClose={() => setShowCreateTask(false)} />}
      {showCreateEvent && <CreateEventModal onClose={() => setShowCreateEvent(false)} />}
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
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="max-w-[860px]">

          {/* ── Controls ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 md:mb-6">
            {/* Status pills */}
            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-lg p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={clsx(
                    "px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-md text-[11px] md:text-[13px] font-semibold transition-all",
                    tab === t.value
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "hover:bg-white/[0.05]"
                  )}
                  style={{ color: tab === t.value ? undefined : "var(--t-secondary)" }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Period pills */}
            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-lg p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={clsx(
                    "px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-md text-[11px] md:text-[13px] font-semibold transition-all",
                    range === r.value
                      ? "bg-white/[0.12] text-white/90 shadow-sm"
                      : "hover:bg-white/[0.05]"
                  )}
                  style={{ color: range === r.value ? undefined : "var(--t-secondary)" }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Add button with dropdown */}
            <div className="ml-auto relative">
              <button
                onClick={() => setShowAddMenu((v) => !v)}
                onBlur={() => setTimeout(() => setShowAddMenu(false), 150)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm"
              >
                <Plus size={15} />
                Добавить
                <ChevronDown size={13} className={clsx("transition-transform", showAddMenu && "rotate-180")} />
              </button>
              {showAddMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border shadow-xl z-20 overflow-hidden"
                  style={{
                    background: "var(--app-bg, #0f1221)",
                    borderColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <button
                    onMouseDown={() => { setShowAddMenu(false); setShowCreateTask(true); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-white/[0.06] transition-colors"
                    style={{ color: "var(--t-primary)" }}
                  >
                    Задача
                  </button>
                  <button
                    onMouseDown={() => { setShowAddMenu(false); setShowCreateEvent(true); }}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-medium hover:bg-white/[0.06] transition-colors"
                    style={{ color: "var(--t-primary)" }}
                  >
                    Событие
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Quick links to templates ─────────────────────────────── */}
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4 overflow-x-auto">
            {[
              { href: "/projects", icon: FolderKanban, label: "Проекты" },
              { href: "/recurring-tasks", icon: Repeat, label: "Повторяющиеся" },
              { href: "/planned-ops", icon: Wallet, label: "Плановые операции" },
              { href: "/event-templates", icon: Calendar, label: "Шаблоны событий" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] md:text-[12px] font-medium whitespace-nowrap transition-colors hover:bg-white/[0.04]"
                style={{ borderColor: "var(--app-border)", color: "var(--t-muted)" }}
              >
                <link.icon size={13} className="opacity-50" />
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── KPI Summary ───────────────────────────────────────────── */}
          {summary && (
            <div className="grid grid-cols-4 gap-1.5 md:gap-3 mb-4 md:mb-6">
              {[
                { label: "Сегодня", value: summary.today_count, color: "var(--t-primary)", border: "border-white/[0.07]", bg: "bg-white/[0.04]" },
                { label: "Неделя", value: summary.week_count, color: "#60a5fa", border: "border-blue-500/20", bg: "bg-blue-500/[0.04]" },
                { label: "Просроч.", value: summary.overdue_count, color: summary.overdue_count > 0 ? "#f87171" : "var(--t-primary)", border: summary.overdue_count > 0 ? "border-red-500/25" : "border-white/[0.07]", bg: summary.overdue_count > 0 ? "bg-red-500/[0.04]" : "bg-white/[0.04]" },
                { label: "Сделано", value: summary.done_today_count, color: "#34d399", border: "border-emerald-500/20", bg: "bg-emerald-500/[0.04]" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className={clsx("rounded-xl border py-2.5 md:p-4 text-center flex flex-col items-center justify-center gap-0.5", kpi.border, kpi.bg)}
                >
                  <p
                    className="text-[20px] md:text-[28px] font-bold tabular-nums leading-none"
                    style={{ color: kpi.color, letterSpacing: "-0.04em" }}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-[9px] md:text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
                    {kpi.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Loading ───────────────────────────────────────────────── */}
          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-white/[0.02] rounded-[14px] animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить план</p>
          )}

          {/* ── Empty state ───────────────────────────────────────────── */}
          {data && data.day_groups.length === 0 && !isLoading && (
            <div className="text-center py-20">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <span className="text-xl">📅</span>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                Ничего не запланировано на этот период
              </p>
              <button
                onClick={() => setShowCreateTask(true)}
                className="mt-4 text-[13px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                + Создать задачу
              </button>
            </div>
          )}

          {/* ── Done today (collapsible) ──────────────────────────────── */}
          {data && tab === "active" && data.done_today.length > 0 && (
            <DoneTodayBlock entries={data.done_today} onComplete={setConfirmEntry} onReschedule={setRescheduleEntry} onExecuteOp={setExecuteEntry} onSkipOp={handleSkipOp} />
          )}

          {/* ── Day groups ────────────────────────────────────────────── */}
          {data && (
            <div className="space-y-4">
              {data.day_groups.map((g, i) => (
                <DayGroupCard
                  key={i}
                  group={g}
                  onComplete={setConfirmEntry}
                  onReschedule={setRescheduleEntry}
                  onExecuteOp={setExecuteEntry}
                  onSkipOp={handleSkipOp}
                  onAddTask={() => setShowCreateTask(true)}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </>
  );
}
