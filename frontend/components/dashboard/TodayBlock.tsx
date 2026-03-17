"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2 } from "lucide-react";
import type { TodayBlock as TodayBlockType, DashboardItem, UpcomingPayment } from "@/types/api";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
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

  return (
    <div
      className={clsx(
        "flex items-center gap-2.5 py-2 md:py-2.5 border-b border-white/[0.05] last:border-0",
        isDone && "opacity-40"
      )}
    >
      {canComplete ? (
        <button
          onClick={() => onComplete(item)}
          className={clsx(
            "w-4 h-4 md:w-[18px] md:h-[18px] rounded-full border-[1.5px] shrink-0 transition-all hover:scale-110",
            isOverdue
              ? "border-red-400/70 hover:bg-red-500/20 hover:border-red-400"
              : "border-white/30 hover:bg-indigo-500/20 hover:border-indigo-400/60"
          )}
        />
      ) : (
        <div
          className={clsx(
            "w-4 h-4 md:w-[18px] md:h-[18px] rounded-full border-[1.5px] shrink-0",
            isDone ? "bg-indigo-500/50 border-indigo-500/50" : "border-white/20"
          )}
        />
      )}

      <div className="flex-1 min-w-0">
        <span
          className={clsx("text-[13px] md:text-[14px] font-[500] leading-snug", isDone ? "line-through" : "")}
          style={{ color: isDone ? "var(--t-muted)" : "var(--t-primary)" }}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {title}
        </span>
        {time && (
          <span className="ml-1.5 text-[11px] md:text-[12px] tabular-nums" style={{ color: "var(--t-muted)" }}>
            {time}
          </span>
        )}
      </div>

      {isOverdue && !isDone && (
        <span className="text-[9px] md:text-[10px] font-medium text-red-400 bg-red-500/[0.12] px-1.5 py-0.5 rounded-md shrink-0">
          просрочено
        </span>
      )}
    </div>
  );
}

function FinanceItem({ op, onClick }: { op: UpcomingPayment; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 py-2 md:py-2.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors text-left"
    >
      <div className="w-4 h-4 md:w-[18px] md:h-[18px] rounded-full border-[1.5px] border-white/20 shrink-0" />
      <span className="flex-1 min-w-0 text-[13px] md:text-[14px] font-[500] truncate" style={{ color: "var(--t-primary)" }}>
        {op.title}
      </span>
      <span className="text-[11px] md:text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>
        {op.kind_label} · {op.amount_formatted}
      </span>
    </button>
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
  const [showOpModal, setShowOpModal] = useState(false);
  const [confirmItem, setConfirmItem] = useState<DashboardItem | null>(null);

  const taskItems = [
    ...(overdue ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
    ...(active ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
    ...(done ?? []).filter((i) => i.kind === "task" || i.kind === "task_occ"),
  ];

  const habitItems = [
    ...(overdue ?? []).filter((i) => i.kind === "habit"),
    ...(active ?? []).filter((i) => i.kind === "habit"),
    ...(done ?? []).filter((i) => i.kind === "habit"),
  ];

  const isEmpty =
    taskItems.length === 0 &&
    habitItems.length === 0 &&
    (events ?? []).length === 0 &&
    (plannedOps ?? []).length === 0;

  return (
    <>
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}
      {confirmItem && isCompletable(confirmItem.kind) && (
        <ConfirmCompleteModal
          kind={confirmItem.kind as CompletableKind}
          id={confirmItem.id}
          title={confirmItem.title}
          onClose={() => setConfirmItem(null)}
        />
      )}

      <div className="rounded-xl md:rounded-[14px] border p-3.5 md:p-5" style={{ borderColor: "rgba(120,140,255,0.4)", background: "rgba(99,102,241,0.04)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2 md:gap-3">
            <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
              Сегодня
            </h2>

            {progress.total > 0 && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="h-1 md:h-1.5 w-16 md:w-20 bg-white/[0.07] rounded-full overflow-hidden">
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

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowTaskModal(true)}
              className="text-[11px] md:text-[13px] px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg bg-indigo-500/[0.12] border border-indigo-500/20 text-indigo-300/80 hover:text-indigo-300 hover:bg-indigo-500/[0.18] transition-all font-medium"
            >
              + Задача
            </button>
            <button
              onClick={() => setShowOpModal(true)}
              className="text-[11px] md:text-[13px] px-2 md:px-2.5 py-0.5 md:py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all font-medium"
              style={{ color: "var(--t-secondary)" }}
            >
              + Операция
            </button>
          </div>
        </div>

        {/* ЗАДАЧИ */}
        {taskItems.length > 0 && (
          <div className="mb-2 md:mb-3">
            <SectionLabel label="Задачи" count={taskItems.length} />
            {taskItems.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* ПРИВЫЧКИ */}
        {habitItems.length > 0 && (
          <div className="mb-2 md:mb-3">
            <SectionLabel label="Привычки" count={habitItems.length} />
            {habitItems.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* СОБЫТИЯ */}
        {(events ?? []).length > 0 && (
          <div className="mb-2 md:mb-3">
            <SectionLabel label="События" count={events.length} />
            {events.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* ФИНАНСЫ */}
        {(plannedOps ?? []).length > 0 && (
          <div className="mb-2 md:mb-3">
            <SectionLabel label="Финансы" count={plannedOps.length} />
            {plannedOps.map((op) => (
              <FinanceItem key={op.occurrence_id} op={op} onClick={() => setShowOpModal(true)} />
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
