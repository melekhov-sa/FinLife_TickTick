"use client";

import { clsx } from "clsx";
import type { HabitItem } from "@/types/api";

interface Props {
  habit: HabitItem;
  onComplete: () => void;
  onOpen: () => void;
  animateBump?: boolean;
  animateGlow?: boolean;
}

function streakBadgeCls(n: number): string {
  if (n >= 30) return "text-emerald-300 bg-emerald-500/15 border-emerald-500/25";
  if (n >= 14) return "text-amber-300 bg-amber-500/15 border-amber-500/25";
  if (n >= 7)  return "text-white/75 bg-white/[0.08] border-white/[0.12]";
  return "text-white/55 bg-white/[0.05] border-white/[0.08]";
}

export function HabitRow({ habit, onComplete, onOpen, animateBump, animateGlow }: Props) {
  const hasStreak = habit.current_streak > 0;

  return (
    <div
      onClick={onOpen}
      className={clsx(
        "group flex items-center gap-3 py-2.5 px-3 rounded-xl border bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/[0.14] cursor-pointer transition-all",
        animateGlow && "habit-card-glow"
      )}
    >
      {/* Complete checkbox — square, click does NOT open detail */}
      <button
        onClick={(e) => { e.stopPropagation(); onComplete(); }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Отметить выполненной"
        className="shrink-0 w-5 h-5 flex items-center justify-center touch-manipulation"
      >
        <span className="w-[16px] h-[16px] rounded-[5px] border-[1.5px] border-violet-400 hover:bg-violet-500/15 transition-colors" />
      </button>

      {/* Emoji */}
      <span className="text-xl shrink-0 leading-none">{habit.category_emoji ?? "🔄"}</span>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p
          className="font-medium leading-snug truncate"
          style={{ fontSize: "var(--fs-body)", color: "var(--t-primary)" }}
        >
          {habit.title}
        </p>
        {(habit.category_title || habit.reminder_time) && (
          <p className="flex items-center gap-2 mt-0.5 truncate" style={{ fontSize: "var(--fs-caption)", color: "var(--t-faint)" }}>
            {habit.category_title && <span>{habit.category_title}</span>}
            {habit.reminder_time && <span>⏰ {habit.reminder_time}</span>}
          </p>
        )}
      </div>

      {/* Streak chip */}
      {hasStreak && (
        <span
          className={clsx(
            "shrink-0 px-2 py-0.5 rounded-full border font-semibold tabular-nums",
            streakBadgeCls(habit.current_streak),
            animateBump && "habit-streak-bump"
          )}
          style={{ fontSize: "var(--fs-badge)" }}
        >
          🔥 {habit.current_streak}
        </span>
      )}
    </div>
  );
}
