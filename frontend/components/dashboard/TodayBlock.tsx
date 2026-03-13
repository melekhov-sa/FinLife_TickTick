"use client";

import { clsx } from "clsx";
import type { TodayBlock as TodayBlockType } from "@/types/api";

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
        "flex items-start gap-2.5 py-2.5 border-b border-white/[0.04] last:border-0",
        isDone && "opacity-40"
      )}
    >
      <div
        className={clsx(
          "w-4 h-4 mt-0.5 rounded-full border shrink-0",
          isDone
            ? "bg-indigo-500/40 border-indigo-500/40"
            : isOverdue
            ? "border-red-500/60"
            : "border-white/20"
        )}
      />
      <div className="flex-1 min-w-0">
        <span
          className={clsx(
            "text-sm",
            isDone ? "line-through text-white/30" : "text-white/75"
          )}
        >
          {emoji && <span className="mr-1">{emoji}</span>}
          {title}
        </span>
        {time && <span className="ml-1.5 text-xs text-white/30">{time}</span>}
      </div>
      {isOverdue && !isDone && (
        <span className="text-[10px] text-red-400/70 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">
          overdue
        </span>
      )}
    </div>
  );
}

export function TodayBlock({ today }: Props) {
  const { overdue, active, done, events, progress } = today;
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-white/60">Today</h2>
        <div className="flex items-center gap-2">
          <div className="h-1 w-20 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-white/30">
            {progress.done}/{progress.total}
          </span>
        </div>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] text-red-400/60 uppercase tracking-wider mb-1">Overdue</p>
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
        <div className="mb-3">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Events</p>
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

      {/* Active */}
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

      {/* Done */}
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

      {overdue.length === 0 && active.length === 0 && events.length === 0 && done.length === 0 && (
        <p className="text-sm text-white/20 text-center py-4">Nothing planned for today</p>
      )}
    </div>
  );
}
