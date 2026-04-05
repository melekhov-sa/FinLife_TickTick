"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2, SkipForward, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TodayBlock as TodayBlockType, DashboardItem, UpcomingPayment } from "@/types/api";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";

interface Props {
  today: TodayBlockType;
  plannedOps: UpcomingPayment[];
}

type CompletableKind = "task" | "habit" | "task_occ";

function isCompletable(kind: string): kind is CompletableKind {
  return kind === "task" || kind === "habit" || kind === "task_occ";
}

function Item({
  item,
  onComplete,
}: {
  item: DashboardItem;
  onComplete: (item: DashboardItem) => void;
}) {
  const { title, category_emoji: emoji, is_done: isDone, is_overdue: isOverdue, time, kind } = item;
  const canComplete = isCompletable(kind) && !isDone;
  const reminders = (item.meta?.reminders as string[]) ?? [];
  const timeStr = time ? String(time).slice(0, 5) : null;

  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 py-1.5 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors rounded-md -mx-1 px-1",
        isDone && "opacity-40"
      )}
    >
      {/* Status icon */}
      <div className="shrink-0">
        {kind === "event" ? (
          <div className="w-6 h-6 flex items-center justify-center">
            <span className="text-[14px]">📅</span>
          </div>
        ) : canComplete ? (
          <button
            onClick={() => onComplete(item)}
            className="w-6 h-6 flex items-center justify-center touch-manipulation"
          >
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] block transition-all",
              kind === "habit" ? "border-violet-400 rounded-[4px]" : isOverdue ? "border-red-400" : "border-slate-400 dark:border-slate-500"
            )} />
          </button>
        ) : (
          <div className="w-6 h-6 flex items-center justify-center">
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] flex items-center justify-center",
              isDone ? "bg-emerald-500 border-emerald-500" : "border-slate-200"
            )}>
              {isDone && <span className="text-white text-[8px] font-bold">✓</span>}
            </span>
          </div>
        )}
      </div>

      {/* Content — single line */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span
          className={clsx("text-[13px] font-medium leading-snug truncate", isDone ? "line-through" : "")}
          style={{ color: isDone ? "var(--t-faint)" : "var(--t-primary)" }}
          title={title}
        >
          {emoji && <span className="mr-0.5">{emoji}</span>}
          {title}
        </span>
        {isOverdue && !isDone && (
          <span className="text-[9px] font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 py-px rounded shrink-0">
            просроч.
          </span>
        )}
        {reminders.length > 0 && !isDone && (
          <span className="text-[9px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
            🔔 {reminders.join(", ")}
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

function FinanceItem({ op, onClick, onSkip }: { op: UpcomingPayment; onClick: () => void; onSkip: () => void }) {
  return (
    <div className="group/fi flex items-center gap-2 py-2 md:py-2.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
      <div className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full border-[1.5px] border-white/20 shrink-0" />
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <span className="text-[13px] md:text-[14px] font-[500] truncate block" style={{ color: "var(--t-primary)" }}>
          {op.title}
        </span>
        <span className="text-[10px] md:text-[11px] tabular-nums" style={{ color: "var(--t-muted)" }}>
          {op.kind_label} · {op.amount_formatted}
        </span>
      </button>
      <button
        onClick={onClick}
        className="md:opacity-0 md:group-hover/fi:opacity-100 flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 active:bg-indigo-600/50 text-indigo-300 text-[11px] font-semibold transition-all shrink-0 touch-manipulation min-h-[36px]"
        title="Выполнить"
      >
        <Play size={10} className="fill-current" />
        <span className="hidden md:inline">Выполнить</span>
      </button>
      <button
        onClick={onSkip}
        className="md:opacity-0 md:group-hover/fi:opacity-100 w-9 h-9 flex items-center justify-center rounded-lg transition-all hover:bg-red-500/15 active:bg-red-500/20 hover:text-red-400 shrink-0 bg-white/[0.04] md:bg-transparent touch-manipulation"
        style={{ color: "var(--t-faint)" }}
        title="Пропустить"
      >
        <SkipForward size={14} />
      </button>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest pt-2 pb-0.5 first:pt-0" style={{ color: "var(--t-faint)", opacity: 0.6 }}>
      {label}
    </p>
  );
}

function GroupDivider() {
  return <div className="h-px bg-slate-100 dark:bg-white/[0.05] my-1" />;
}

export function TodayBlock({ today, plannedOps }: Props) {
  const { overdue, active, done, events, progress } = today;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [executeOp, setExecuteOp] = useState<UpcomingPayment | null>(null);
  const [showOpModal, setShowOpModal] = useState(false);
  const [confirmItem, setConfirmItem] = useState<DashboardItem | null>(null);

  const [showDone, setShowDone] = useState(false);

  const activeTasks = [
    ...(overdue ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
    ...(active ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
  ];
  const doneTasks = (done ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ");

  const activeHabits = [
    ...(overdue ?? []).filter((i) => i.kind === "habit"),
    ...(active ?? []).filter((i) => i.kind === "habit"),
  ];
  const doneHabits = (done ?? []).filter((i) => i.kind === "habit");

  const isEmpty =
    activeTasks.length === 0 && doneTasks.length === 0 &&
    activeHabits.length === 0 && doneHabits.length === 0 &&
    (events ?? []).length === 0 &&
    (plannedOps ?? []).length === 0;

  const qc = useQueryClient();
  const { mutate: skipOp } = useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/skip`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  return (
    <>
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}
      {executeOp && (
        <CreateOperationModal
          occurrenceId={executeOp.occurrence_id}
          initialValues={{
            opType: executeOp.kind as "INCOME" | "EXPENSE" | "TRANSFER" | undefined,
            amount: String(executeOp.amount),
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
        />
      )}

      <div className="rounded-xl md:rounded-[14px] border p-3 md:p-5 bg-white dark:bg-white/[0.02]" style={{ borderColor: "rgba(99,102,241,0.25)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2 md:mb-3">
          <div className="flex items-center gap-2 md:gap-3">
            <h2 className="text-[14px] md:text-[15px] font-bold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
              Сегодня
            </h2>

            {progress.total > 0 && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="h-1 md:h-1.5 w-16 md:w-20 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.06)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${progressPct}%`,
                      background: progressPct === 100
                        ? "linear-gradient(90deg, #10b981, #34d399)"
                        : "linear-gradient(90deg, #6366f1, #818cf8)",
                    }}
                  />
                </div>
                <span className="text-[11px] md:text-[12px] tabular-nums" style={{ color: "var(--t-secondary)" }}>
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}
          </div>

          {/* Desktop only: add buttons */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setShowTaskModal(true)}
              className="text-[13px] px-2.5 py-1 rounded-lg bg-indigo-500/[0.12] border border-indigo-500/20 text-indigo-300/80 hover:text-indigo-300 hover:bg-indigo-500/[0.18] transition-all font-medium"
            >
              + Задача
            </button>
            <button
              onClick={() => setShowOpModal(true)}
              className="text-[13px] px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all font-medium"
              style={{ color: "var(--t-secondary)" }}
            >
              + Операция
            </button>
          </div>
        </div>

        {/* ── Grouped sections ── */}
        {(() => {
          const allTasks = [...activeTasks, ...(showDone ? doneTasks : [])];
          const allHabits = [...activeHabits, ...(showDone ? doneHabits : [])];
          const eventItems = events ?? [];
          const finOps = plannedOps ?? [];

          const doneItems = [...doneTasks, ...doneHabits];
          const hiddenDoneCount = showDone ? 0 : doneItems.length;

          const groups: { key: string; label: string; content: React.ReactNode }[] = [];

          if (allTasks.length > 0) {
            groups.push({
              key: "tasks",
              label: "Задачи",
              content: allTasks.map((item) => (
                <div key={`${item.kind}-${item.id}`} className={item.is_done ? "opacity-45" : undefined}>
                  <Item item={item} onComplete={setConfirmItem} />
                </div>
              )),
            });
          }

          if (allHabits.length > 0) {
            groups.push({
              key: "habits",
              label: "Привычки",
              content: allHabits.map((item) => (
                <div key={`${item.kind}-${item.id}`} className={item.is_done ? "opacity-45" : undefined}>
                  <Item item={item} onComplete={setConfirmItem} />
                </div>
              )),
            });
          }

          if (eventItems.length > 0) {
            groups.push({
              key: "events",
              label: "События",
              content: eventItems.map((item) => (
                <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
              )),
            });
          }

          if (finOps.length > 0) {
            groups.push({
              key: "finance",
              label: "Финансы",
              content: finOps.map((op) => (
                <FinanceItem key={op.occurrence_id} op={op} onClick={() => setExecuteOp(op)} onSkip={() => skipOp(op.occurrence_id)} />
              )),
            });
          }

          return (
            <>
              {groups.map((g, idx) => (
                <div key={g.key}>
                  {idx > 0 && <GroupDivider />}
                  <GroupHeader label={g.label} />
                  {g.content}
                </div>
              ))}

              {/* Show/hide done toggle */}
              {!showDone && hiddenDoneCount > 0 && (
                <button
                  onClick={() => setShowDone(true)}
                  className="w-full text-center py-1.5 text-[11px] font-medium transition-colors hover:text-indigo-500 touch-manipulation"
                  style={{ color: "var(--t-faint)" }}
                >
                  + ещё {hiddenDoneCount} выполненных
                </button>
              )}
              {showDone && doneItems.length > 0 && (
                <button
                  onClick={() => setShowDone(false)}
                  className="w-full text-center py-1 text-[10px] font-medium transition-colors hover:text-indigo-500"
                  style={{ color: "var(--t-faint)" }}
                >
                  Скрыть выполненные
                </button>
              )}
            </>
          );
        })()}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center gap-1.5 py-4 md:py-6 text-center">
            <CheckCircle2 size={24} className="text-indigo-400/30" />
            <p className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>На сегодня ничего не запланировано</p>
          </div>
        )}
      </div>
    </>
  );
}
