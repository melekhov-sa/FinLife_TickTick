"use client";

import { clsx } from "clsx";
import { Flame } from "lucide-react";
import type { HabitItem } from "@/types/api";

interface Props {
  habits: HabitItem[];
  onComplete: (habitId: number) => void;
  onOpen: (habit: HabitItem) => void;
}

function streakColor(n: number): string {
  if (n >= 30) return "text-emerald-400";
  if (n >= 14) return "text-amber-400";
  return "text-white/70";
}

export function ProtectStreakBlock({ habits, onComplete, onOpen }: Props) {
  if (habits.length === 0) return null;

  return (
    <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Flame size={14} className="text-amber-400 shrink-0" />
        <h3
          className="font-semibold uppercase tracking-widest"
          style={{ fontSize: "var(--fs-badge)", color: "var(--t-muted)" }}
        >
          Береги серию
        </h3>
      </div>

      <div className="space-y-2">
        {habits.map((habit) => (
          <div
            key={habit.habit_id}
            className="flex items-center gap-3 bg-white/[0.04] rounded-xl px-3 py-2.5 border border-white/[0.06] hover:bg-white/[0.07] cursor-pointer transition-all"
            onClick={() => onOpen(habit)}
          >
            <span className="text-lg shrink-0">{habit.category_emoji ?? "🔄"}</span>
            <div className="flex-1 min-w-0">
              <p
                className="font-medium truncate"
                style={{ fontSize: "var(--fs-secondary)", color: "var(--t-primary)" }}
              >
                {habit.title}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={clsx("font-bold tabular-nums leading-none", streakColor(habit.current_streak))}
                style={{ fontSize: "var(--fs-title)" }}
              >
                {habit.current_streak}
              </span>
              <span style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}>дн.</span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onComplete(habit.habit_id); }}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/80 hover:bg-amber-400 text-white font-semibold transition-colors"
              style={{ fontSize: "var(--fs-badge)" }}
            >
              ✓
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
