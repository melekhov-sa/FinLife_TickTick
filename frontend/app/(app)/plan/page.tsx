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
  { value: 90, label: "3 месяца" },
];

const KIND_LABELS: Record<string, string> = {
  task:       "Задача",
  task_occ:   "Задача",
  event:      "Событие",
  planned_op: "Операция",
  habit:      "Привычка",
  wish:       "Желание",
};

type CompletableKind = "task" | "habit" | "task_occ";

function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
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

  return (
    <div className={clsx(
      "flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-1.5 -mx-1.5 transition-colors",
      entry.is_done && "opacity-40"
    )}>
      {/* Left indicator: checkbox for tasks/habits, event icon, dot for others */}
      <div className="mt-1 shrink-0">
        {canComplete ? (
          <button
            onClick={() => onComplete(entry)}
            className={clsx(
              "w-[17px] h-[17px] rounded-full border-[1.5px] transition-all hover:scale-110",
              entry.is_overdue
                ? "border-red-400/70 hover:bg-red-500/20 hover:border-red-400"
                : "border-white/35 hover:bg-white/10 hover:border-white/60"
            )}
            title="Отметить как выполненное"
          />
        ) : entry.is_done && isCompletable(entry.kind) ? (
          <div className="w-[17px] h-[17px] rounded-full bg-indigo-500/50 border-[1.5px] border-indigo-500/50 flex items-center justify-center">
            <span className="text-[9px] text-white/80">✓</span>
          </div>
        ) : isEvent ? (
          <span className="text-sm">📅</span>
        ) : (
          <div className={clsx(
            "w-2 h-2 rounded-full mt-1 shadow-[0_0_6px_currentColor]",
            entry.kind === "planned_op" ? "bg-amber-500" : "bg-white/20"
          )} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={clsx(
            "text-sm truncate",
            entry.is_done ? "line-through text-white/60"
              : entry.is_overdue ? "text-red-400/90"
              : "text-white/85"
          )}>
            {entry.category_emoji && <span className="mr-1">{entry.category_emoji}</span>}
            {entry.title}
          </span>
          {entry.time && (
            <span className="text-[10px] font-medium text-white/60 shrink-0 tabular-nums">
              {entry.time}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] font-semibold text-white/55 uppercase tracking-widest">
            {KIND_LABELS[entry.kind] ?? entry.kind}
          </span>
          {entry.kind === "planned_op" && Boolean(entry.meta.amount_formatted) && (
            <span className={clsx("text-[10px] font-semibold tabular-nums",
              (entry.meta.op_kind as string) === "INCOME" ? "text-emerald-400/70" : "text-red-400/70"
            )}>
              {(entry.meta.op_kind as string) === "INCOME" ? "+" : "−"}{String(entry.meta.amount_formatted)} ₽
            </span>
          )}
          {entry.kind === "habit" && Boolean(entry.meta.current_streak) && (
            <span className="text-[10px] text-white/55">🔥 {String(entry.meta.current_streak)}</span>
          )}
        </div>
      </div>

      {entry.is_overdue && !entry.is_done && (
        <span className="text-[10px] font-semibold text-red-400 bg-red-500/[0.12] border border-red-500/20 px-1.5 py-0.5 rounded-md shrink-0">
          просрочено
        </span>
      )}
    </div>
  );
}

function DayGroupCard({
  group,
  onComplete,
}: {
  group: DayGroup;
  onComplete: (entry: PlanEntry) => void;
}) {
  return (
    <div className={clsx(
      "bg-white/[0.03] rounded-2xl border p-5",
      group.is_overdue_group ? "border-red-500/25"
        : group.is_today ? "border-indigo-500/30"
        : "border-white/[0.06]"
    )}>
      <div className="flex items-center gap-2.5 mb-4">
        <h3 className={clsx(
          "text-[10px] font-semibold uppercase tracking-widest",
          group.is_overdue_group ? "text-red-400/80"
            : group.is_today ? "text-indigo-400/80"
            : "text-white/65"
        )}>
          {group.date_label}
        </h3>
        <span className="text-[10px] font-medium text-white/55 bg-white/[0.05] px-1.5 py-0.5 rounded-full">
          {group.entries.length}
        </span>
      </div>
      {group.entries.map((e) => (
        <EntryRow key={`${e.kind}-${e.id}`} entry={e} onComplete={onComplete} />
      ))}
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
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={clsx(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  tab === t.value
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-white/68 hover:text-white/70 hover:bg-white/[0.05]"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={clsx(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  range === r.value
                    ? "bg-white/[0.12] text-white/90 shadow-sm"
                    : "text-white/68 hover:text-white/70 hover:bg-white/[0.05]"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateTask(true)}
            className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
          >
            + Задача
          </button>
        </div>

        {/* KPI Summary */}
        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Сегодня",         value: summary.today_count,      color: "text-white/88",    border: "" },
              { label: "На неделе",       value: summary.week_count,       color: "text-blue-400",    border: "" },
              { label: "Просрочено",      value: summary.overdue_count,    color: summary.overdue_count > 0 ? "text-red-400" : "text-white/88", border: summary.overdue_count > 0 ? "border-red-500/20" : "" },
              { label: "Сделано сегодня", value: summary.done_today_count, color: "text-emerald-400", border: "" },
            ].map((kpi) => (
              <div key={kpi.label} className={clsx("bg-white/[0.04] border rounded-2xl p-4 text-center", kpi.border || "border-white/[0.07]")}>
                <p className={clsx("text-3xl font-bold tabular-nums", kpi.color)} style={{ letterSpacing: "-0.04em" }}>
                  {kpi.value}
                </p>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-1.5">{kpi.label}</p>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-white/[0.02] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить план</p>
        )}

        {data && data.day_groups.length === 0 && !isLoading && (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
              <span className="text-xl">📅</span>
            </div>
            <p className="text-white/60 text-sm font-medium">Ничего не запланировано на этот период</p>
            <button
              onClick={() => setShowCreateTask(true)}
              className="mt-4 text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
            >
              + Создать задачу
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {data.day_groups.map((g, i) => (
              <DayGroupCard key={i} group={g} onComplete={setConfirmEntry} />
            ))}

            {tab === "active" && data.done_today.length > 0 && (
              <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400/70 mb-4">
                  ✓ Выполнено сегодня ({data.done_today.length})
                </h3>
                {data.done_today.map((e) => (
                  <EntryRow key={`done-${e.kind}-${e.id}`} entry={e} onComplete={setConfirmEntry} />
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </main>
    </>
  );
}
