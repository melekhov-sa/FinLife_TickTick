"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2, SkipForward, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TodayBlock as TodayBlockType, DashboardItem, UpcomingPayment } from "@/types/api";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
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
        "flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1",
        isDone && "opacity-40"
      )}
    >
      {/* Checkbox / icon */}
      <div className="shrink-0">
        {kind === "event" ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <span className="text-[14px]">📅</span>
          </div>
        ) : canComplete ? (
          <button
            onClick={() => onComplete(item)}
            className="w-5 h-5 flex items-center justify-center touch-manipulation"
          >
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] block transition-all",
              kind === "habit" ? "border-violet-400 rounded-[3px]" : isOverdue ? "border-red-400" : "border-indigo-400/60 dark:border-slate-500"
            )} />
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
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span
          className={clsx("text-[14px] md:text-[15px] font-medium leading-snug truncate", isDone ? "line-through" : "")}
          style={{ color: isDone ? "var(--t-faint)" : "var(--t-primary)" }}
          title={title}
        >
          {emoji && <span className="mr-0.5">{emoji}</span>}
          {title}
        </span>
        {isOverdue && !isDone && (
          <span className="text-[8px] font-bold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 py-px rounded shrink-0">
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
    <div className="group/fi flex items-center gap-2.5 py-[6px] hover:bg-indigo-50/50 dark:hover:bg-white/[0.04] transition-colors rounded-md -mx-1 px-1">
      <div className="w-[16px] h-[16px] rounded-full border-[1.5px] border-indigo-300/60 dark:border-white/20 shrink-0" />
      <button
        onClick={onClick}
        className="flex-1 min-w-0 text-left flex items-center gap-1.5"
      >
        <span className="text-[14px] md:text-[15px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
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

export function TodayBlock({ today, plannedOps }: Props) {
  const { overdue, active, done, events, progress } = today;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const [executeOp, setExecuteOp] = useState<UpcomingPayment | null>(null);
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
        />
      )}

      <div
        className="rounded-xl md:rounded-2xl border p-3.5 md:p-5 relative overflow-hidden"
        style={{
          borderColor: "rgba(99,102,241,0.25)",
          background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))",
        }}
      >
        {/* Header */}
        <div className="mb-2.5">
          <h2 className="text-[18px] md:text-[20px] font-bold tracking-tight" style={{ color: "var(--t-primary)" }}>
            Сегодня
          </h2>
          {progress.total > 0 && (
            <p className="text-[13px] md:text-[14px] font-medium mt-0.5" style={{ color: "var(--t-muted)" }}>
              {progress.done} из {progress.total} выполнено
            </p>
          )}

          {/* Progress bar */}
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
