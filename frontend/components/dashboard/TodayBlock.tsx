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
  const timeStr = time ? String(time).slice(0, 5) : null; // HH:MM without seconds

  const kindLabel = kind === "event" ? "Событие" : kind === "habit" ? "Привычка" : "Задача";

  return (
    <div
      className={clsx(
        "flex items-start gap-2 py-1.5 md:py-2 border-b border-slate-100 dark:border-white/[0.05] last:border-0",
        isDone && "opacity-40"
      )}
    >
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {kind === "event" ? (
          <div className="w-7 h-7 flex items-center justify-center">
            <span className="text-[14px]">📅</span>
          </div>
        ) : canComplete ? (
          <button
            onClick={() => onComplete(item)}
            className="w-7 h-7 flex items-center justify-center touch-manipulation"
          >
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] block transition-all",
              kind === "habit" ? "border-violet-400 rounded-[4px]" : isOverdue ? "border-red-400" : "border-slate-300 dark:border-white/30"
            )} />
          </button>
        ) : (
          <div className="w-7 h-7 flex items-center justify-center">
            <span className={clsx(
              "w-[16px] h-[16px] rounded-full border-[1.5px] block",
              isDone ? "bg-emerald-500/60 border-emerald-500/60" : "border-slate-200"
            )}>
              {isDone && <span className="text-white text-[9px] flex items-center justify-center h-full">✓</span>}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Line 1: emoji + title + time */}
        <div className="flex items-baseline gap-1">
          <span
            className={clsx("text-[13px] font-medium leading-snug truncate flex-1", isDone ? "line-through" : "")}
            style={{ color: isDone ? "var(--t-faint)" : "var(--t-primary)" }}
            title={title}
          >
            {emoji && <span className="mr-1">{emoji}</span>}
            {title}
          </span>
          {timeStr && (
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
              {timeStr}
            </span>
          )}
        </div>

        {/* Line 2: kind badge + reminders */}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] font-medium" style={{ color: "var(--t-faint)" }}>
            {kindLabel}
          </span>
          {isOverdue && !isDone && (
            <span className="text-[9px] font-semibold text-red-500 bg-red-50 dark:bg-red-500/10 px-1 py-px rounded">
              просрочено
            </span>
          )}
          {reminders.length > 0 && !isDone && (
            <span className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
              🔔 {reminders.join(", ")}
            </span>
          )}
        </div>
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

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>
      {label} · {count}
    </p>
  );
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

  const totalDone = doneTasks.length + doneHabits.length;

  const habitItems = [...activeHabits, ...(showDone ? doneHabits : [])];

  const isEmpty =
    activeTasks.length === 0 && doneTasks.length === 0 &&
    habitItems.length === 0 &&
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

      <div className="rounded-xl md:rounded-[14px] border p-2.5 md:p-5" style={{ borderColor: "rgba(120,140,255,0.4)", background: "rgba(99,102,241,0.04)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2 md:mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
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

        {/* ── Unified list: active first, then done ── */}
        {(() => {
          const activeItems: DashboardItem[] = [
            ...activeTasks,
            ...activeHabits,
            ...(events ?? []),
          ];
          const doneItems: DashboardItem[] = [...doneTasks, ...doneHabits];
          const PREVIEW_LIMIT = 5;
          const [expanded, setExpanded] = [showDone, setShowDone];

          const visibleActive = activeItems;
          const visibleDone = expanded ? doneItems : doneItems.slice(0, Math.max(0, PREVIEW_LIMIT - activeItems.length));
          const hiddenDoneCount = expanded ? 0 : doneItems.length - visibleDone.length;

          return (
            <>
              {visibleActive.map((item) => (
                <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
              ))}
              {visibleDone.length > 0 && visibleDone.map((item) => (
                <div key={`done-${item.kind}-${item.id}`} className="opacity-50">
                  <Item item={item} onComplete={setConfirmItem} />
                </div>
              ))}
              {hiddenDoneCount > 0 && (
                <button
                  onClick={() => setExpanded(true)}
                  className="w-full text-center py-1.5 text-[11px] font-medium transition-colors hover:text-indigo-500 touch-manipulation"
                  style={{ color: "var(--t-faint)" }}
                >
                  + ещё {hiddenDoneCount} выполненных
                </button>
              )}
              {expanded && doneItems.length > 0 && (
                <button
                  onClick={() => setExpanded(false)}
                  className="w-full text-center py-1 text-[10px] font-medium transition-colors hover:text-indigo-500"
                  style={{ color: "var(--t-faint)" }}
                >
                  Скрыть
                </button>
              )}
            </>
          );
        })()}

        {/* ФИНАНСЫ */}
        {(plannedOps ?? []).length > 0 && (
          <div className="mt-1.5 md:mt-3">
            <SectionLabel label="Финансы" count={plannedOps.length} />
            {plannedOps.map((op) => (
              <FinanceItem key={op.occurrence_id} op={op} onClick={() => setExecuteOp(op)} onSkip={() => skipOp(op.occurrence_id)} />
            ))}
          </div>
        )}

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
