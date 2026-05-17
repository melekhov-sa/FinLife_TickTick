"use client";

import { useProductivity } from "../useProductivity";
import type { WidgetProps } from "../types";

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-2 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="flex-1 h-3 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="w-8 h-5 rounded" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}

const STREAK_COLOR = (n: number) => {
  if (n >= 30) return "#F59E0B";
  if (n >= 14) return "#6366F1";
  if (n >= 7)  return "#10B981";
  return "var(--t-muted)";
};

export function HabitsStreaksWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useProductivity();

  if (isLoading || !data) return <Skeleton />;

  const { top_habits, best_streak, rate_7d } = data.habits;

  if (top_habits.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет привычек</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header stats */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
          🔥 лучший стрик: <strong style={{ color: "var(--t-primary)" }}>{best_streak}</strong>
        </span>
        <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
          7д: <strong style={{ color: "var(--t-primary)" }}>{rate_7d}%</strong>
        </span>
      </div>

      {/* Habits list */}
      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {top_habits.map((habit, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{
                background: `${STREAK_COLOR(habit.current_streak)}20`,
                color: STREAK_COLOR(habit.current_streak),
              }}
            >
              {habit.current_streak > 0 ? habit.current_streak : "—"}
            </span>
            <span
              className="flex-1 text-[12px] truncate"
              style={{ color: "var(--t-secondary)" }}
            >
              {habit.title}
            </span>
            <span
              className="text-[10px] shrink-0 tabular-nums"
              style={{ color: "var(--t-faint)" }}
            >
              30д: {habit.done_30d}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
