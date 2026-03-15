"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CheckCircle2 } from "lucide-react";
import type { TodayBlock as TodayBlockType } from "@/types/api";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";

interface Props {
  today: TodayBlockType;
}

function Item({
  title,
  emoji,
  isDone,
  isOverdue,
  time,
}: {
  title: string;
  emoji?: string | null;
  isDone: boolean;
  isOverdue: boolean;
  time?: string | null;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0",
        isDone && "opacity-40"
      )}
    >
      <div
        className={clsx(
          "w-[15px] h-[15px] rounded-full border-[1.5px] shrink-0 transition-colors",
          isDone
            ? "bg-indigo-500/50 border-indigo-500/50"
            : isOverdue
            ? "border-red-500/70"
            : "border-white/25"
        )}
      />
      <div className="flex-1 min-w-0">
        <span
          className={clsx(
            "text-sm leading-snug",
            isDone ? "line-through" : ""
          )}
          style={{ color: isDone ? "var(--t-muted)" : "var(--t-primary)" }}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {title}
        </span>
        {time && <span className="ml-2 text-xs tabular-nums" style={{ color: "var(--t-muted)" }}>{time}</span>}
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

  return (
    <>
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}

      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
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
                <span className="text-xs tabular-nums" style={{ color: "var(--t-secondary)" }}>
                  {progress.done}/{progress.total}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowTaskModal(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/[0.12] border border-indigo-500/20 text-indigo-300/80 hover:text-indigo-300 hover:bg-indigo-500/[0.18] transition-all font-medium"
            >
              + Задача
            </button>
            <button
              onClick={() => setShowOpModal(true)}
              className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all font-medium"
              style={{ color: "var(--t-secondary)" }}
            >
              + Операция
            </button>
          </div>
        </div>

        {/* Overdue section */}
        {overdue.length > 0 && (
          <div className="mb-2 pl-3 border-l-2 border-red-500/40">
            <p className="text-[10px] font-semibold text-red-400/70 uppercase tracking-widest mb-1.5">
              Просрочено · {overdue.length}
            </p>
            {overdue.map((item) => (
              <Item
                key={`${item.kind}-${item.id}`}
                title={item.title}
                emoji={item.category_emoji}
                isDone={false}
                isOverdue={true}
              />
            ))}
          </div>
        )}

        {/* Events */}
        {events.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-muted)" }}>
              События
            </p>
            {events.map((item) => (
              <Item
                key={`${item.kind}-${item.id}`}
                title={item.title}
                emoji={item.category_emoji}
                isDone={false}
                isOverdue={false}
                time={item.time ?? undefined}
              />
            ))}
          </div>
        )}

        {/* Active tasks */}
        {active.map((item) => (
          <Item
            key={`${item.kind}-${item.id}`}
            title={item.title}
            emoji={item.category_emoji}
            isDone={false}
            isOverdue={false}
            time={item.time ?? undefined}
          />
        ))}

        {/* Done tasks */}
        {done.length > 0 && (
          <div className="mt-2">
            {done.map((item) => (
              <Item
                key={`${item.kind}-${item.id}`}
                title={item.title}
                emoji={item.category_emoji}
                isDone={true}
                isOverdue={false}
              />
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
