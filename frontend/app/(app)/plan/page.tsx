"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";
import { clsx } from "clsx";

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
  task:       "text-indigo-300/70 bg-indigo-500/[0.08]",
  task_occ:   "text-indigo-300/70 bg-indigo-500/[0.08]",
  event:      "text-sky-300/70 bg-sky-500/[0.08]",
  planned_op: "text-amber-300/70 bg-amber-500/[0.08]",
  habit:      "text-violet-300/70 bg-violet-500/[0.08]",
  wish:       "text-pink-300/70 bg-pink-500/[0.08]",
};

type CompletableKind = "task" | "habit" | "task_occ";

function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
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
}: {
  entry: PlanEntry;
  onComplete: (entry: PlanEntry) => void;
}) {
  const canComplete = isCompletable(entry.kind) && !entry.is_done;
  const isEvent = entry.kind === "event";
  const isOp = entry.kind === "planned_op";
  const opKind = entry.meta.op_kind as string | undefined;
  const amountFormatted = entry.meta.amount_formatted as string | undefined;

  return (
    <div className={clsx(
      "flex items-start gap-3 py-2.5 border-b last:border-0 rounded-lg px-2 -mx-2 transition-colors cursor-default",
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

      {entry.is_overdue && !entry.is_done && (
        <span className="text-[10px] font-semibold text-red-400 bg-red-500/[0.12] border border-red-500/20 px-1.5 py-0.5 rounded-md shrink-0 mt-0.5">
          просрочено
        </span>
      )}
    </div>
  );
}

function DayGroupCard({
  group,
  onComplete,
  onAddTask,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
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
        <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} />
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

export default function PlanPage() {
  const [tab, setTab] = useState<"active" | "done" | "archive">("active");
  const [range, setRange] = useState(7);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<PlanEntry | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<PlanData>({
    queryKey: ["plan", tab, range],
    queryFn: () =>
      fetch(`/api/v2/plan?tab=${tab}&range=${range}`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const summary = data?.summary;

  return (
    <>
      {showCreateTask && <CreateTaskModal onClose={() => setShowCreateTask(false)} />}
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
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[860px]">

          {/* ── Controls ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-end gap-6 mb-6">
            {/* Status group */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                Статус
              </span>
              <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={clsx(
                      "px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
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
            </div>

            {/* Period group */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                Период
              </span>
              <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={clsx(
                      "px-3.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
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
            </div>

            {/* Add task button */}
            <button
              onClick={() => setShowCreateTask(true)}
              className="ml-auto flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-xl px-4 py-2 transition-colors shadow-sm"
            >
              <span className="text-[16px] leading-none">+</span>
              Задача
            </button>
          </div>

          {/* ── KPI Summary ───────────────────────────────────────────── */}
          {summary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: "Сегодня",
                  value: summary.today_count,
                  color: "var(--t-primary)",
                  border: "border-white/[0.07]",
                  bg: "bg-white/[0.04]",
                },
                {
                  label: "На неделе",
                  value: summary.week_count,
                  color: "#60a5fa",
                  border: "border-blue-500/20",
                  bg: "bg-blue-500/[0.04]",
                },
                {
                  label: "Просрочено",
                  value: summary.overdue_count,
                  color: summary.overdue_count > 0 ? "#f87171" : "var(--t-primary)",
                  border: summary.overdue_count > 0 ? "border-red-500/25" : "border-white/[0.07]",
                  bg: summary.overdue_count > 0 ? "bg-red-500/[0.04]" : "bg-white/[0.04]",
                },
                {
                  label: "Сделано",
                  value: summary.done_today_count,
                  color: "#34d399",
                  border: "border-emerald-500/20",
                  bg: "bg-emerald-500/[0.04]",
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className={clsx("rounded-[14px] border p-4 text-center min-h-[80px] flex flex-col items-center justify-center gap-1", kpi.border, kpi.bg)}
                >
                  <p
                    className="text-[28px] font-bold tabular-nums leading-none"
                    style={{ color: kpi.color, letterSpacing: "-0.04em" }}
                  >
                    {kpi.value}
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
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

          {/* ── Day groups ────────────────────────────────────────────── */}
          {data && (
            <div className="space-y-4">
              {tab === "active" && data.done_today.length > 0 && (
                <div className="bg-white/[0.03] rounded-[14px] border border-white/[0.06] p-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-muted)" }}>
                    ✓ Выполнено сегодня · {data.done_today.length}
                  </h3>
                  {data.done_today.map((e) => (
                    <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={setConfirmEntry} />
                  ))}
                </div>
              )}

              {data.day_groups.map((g, i) => (
                <DayGroupCard
                  key={i}
                  group={g}
                  onComplete={setConfirmEntry}
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
