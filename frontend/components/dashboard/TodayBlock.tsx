"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2 } from "lucide-react";
import type { TodayBlock as TodayBlockType, DashboardItem } from "@/types/api";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { ConfirmCompleteModal } from "@/components/modals/ConfirmCompleteModal";

interface Props {
  today: TodayBlockType;
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
        "flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0",
        isDone && "opacity-40"
      )}
    >
      {/* Checkbox / status circle */}
      {canComplete ? (
        <button
          onClick={() => onComplete(item)}
          className={clsx(
            "w-[18px] h-[18px] rounded-full border-[1.5px] shrink-0 transition-all hover:scale-110",
            isOverdue
              ? "border-red-400/70 hover:bg-red-500/20 hover:border-red-400"
              : "border-white/35 hover:bg-white/10 hover:border-white/60"
          )}
          title="Отметить как выполненное"
        />
      ) : (
        <div
          className={clsx(
            "w-[18px] h-[18px] rounded-full border-[1.5px] shrink-0",
            isDone
              ? "bg-indigo-500/50 border-indigo-500/50"
              : "border-white/20"
          )}
        />
      )}

      <div className="flex-1 min-w-0">
        <span
          className={clsx("t-main leading-snug", isDone ? "line-through" : "")}
          style={{ color: isDone ? "var(--t-muted)" : "var(--t-primary)" }}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {title}
        </span>
        {time && (
          <span className="ml-2 text-[13px] tabular-nums" style={{ color: "var(--t-muted)" }}>
            {time}
          </span>
        )}
      </div>

      {isOverdue && !isDone && (
        <span className="text-[10px] font-medium text-red-400 bg-red-500/[0.12] px-1.5 py-0.5 rounded-md shrink-0">
          просрочено
        </span>
      )}
    </div>
  );
}

export function TodayBlock({ today }: Props) {
  const { overdue, active, done, events, progress } = today;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isEmpty = overdue.length === 0 && active.length === 0 && events.length === 0 && done.length === 0;

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);
  const [confirmItem, setConfirmItem] = useState<DashboardItem | null>(null);

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

      <div className="bg-white/[0.03] rounded-[14px] border border-white/[0.06] p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
              Сегодня
            </h2>
            {progress.total > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 bg-white/[0.07] rounded-full overflow-hidden">
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
                <span className="t-secondary tabular-nums" style={{ color: "var(--t-secondary)" }}>
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
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

        {/* Overdue section */}
        {overdue.length > 0 && (
          <div className="mb-2 pl-3 border-l-2 border-red-500/40">
            <p className="text-[11px] font-semibold text-red-400/70 uppercase tracking-widest mb-1.5">
              Просрочено · {overdue.length}
            </p>
            {overdue.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* Events */}
        {events.length > 0 && (
          <div className="mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-muted)" }}>
              События
            </p>
            {events.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* Active tasks & habits */}
        {active.map((item) => (
          <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
        ))}

        {/* Done */}
        {done.length > 0 && (
          <div className="mt-2">
            {done.map((item) => (
              <Item key={`${item.kind}-${item.id}`} item={item} onComplete={setConfirmItem} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 size={28} className="text-white/15" />
            <p className="text-sm" style={{ color: "var(--t-muted)" }}>На сегодня ничего не запланировано</p>
          </div>
        )}
      </div>
    </>
  );
}
