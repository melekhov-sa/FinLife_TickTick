"use client";

import { clsx } from "clsx";
import { Check, Archive } from "lucide-react";
import type { TaskItem } from "@/types/api";

interface TaskRowProps {
  task: TaskItem;
  onComplete?: (id: number) => void;
  onArchive?: (id: number) => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function TaskRow({ task, onComplete, onArchive }: TaskRowProps) {
  const isDone = task.status === "DONE";
  const isArchived = task.status === "ARCHIVED";
  const dateLabel = formatDate(task.due_date);

  return (
    <div
      className={clsx(
        "group flex items-center gap-3 px-3 py-3 rounded-xl transition-colors -mx-1",
        isDone || isArchived
          ? "opacity-45"
          : "hover:bg-white/[0.03]"
      )}
    >
      {/* Complete button */}
      <button
        onClick={() => !isDone && onComplete?.(task.task_id)}
        disabled={isDone || isArchived}
        className={clsx(
          "shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all",
          isDone
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
            : "border-white/[0.15] text-transparent hover:border-indigo-400/50 hover:text-indigo-400/40"
        )}
      >
        <Check size={11} strokeWidth={2.5} />
      </button>

      {/* Emoji */}
      {task.category_emoji && (
        <span className="text-sm shrink-0">{task.category_emoji}</span>
      )}

      {/* Title */}
      <p
        className={clsx(
          "flex-1 text-sm min-w-0 truncate",
          isDone || isArchived
            ? "line-through text-white/30"
            : "text-white/80 font-medium"
        )}
      >
        {task.title}
      </p>

      {/* Overdue badge */}
      {task.is_overdue && !isDone && !isArchived && (
        <span className="shrink-0 text-[10px] font-semibold text-red-400 bg-red-500/[0.12] border border-red-500/20 px-1.5 py-0.5 rounded-md">
          просрочено
        </span>
      )}

      {/* Due date */}
      {dateLabel && !task.is_overdue && (
        <span className="text-[11px] font-medium shrink-0 tabular-nums text-white/30">
          {dateLabel}
        </span>
      )}

      {/* Archive button (active tasks only) */}
      {!isDone && !isArchived && (
        <button
          onClick={() => onArchive?.(task.task_id)}
          className="shrink-0 text-white/0 group-hover:text-white/20 hover:!text-white/55 transition-colors"
          title="В архив"
        >
          <Archive size={13} />
        </button>
      )}
    </div>
  );
}
