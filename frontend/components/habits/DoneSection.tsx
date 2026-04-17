"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { HabitItem } from "@/types/api";

interface Props {
  habits: HabitItem[];
  onOpen: (habit: HabitItem) => void;
}

export function DoneSection({ habits, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (habits.length === 0) return null;

  return (
    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span
          className="font-medium"
          style={{ fontSize: "var(--fs-secondary)", color: "var(--t-muted)" }}
        >
          Выполнено сегодня: {habits.length}
        </span>
        <ChevronDown
          size={15}
          className={clsx("transition-transform", expanded ? "rotate-180" : "")}
          style={{ color: "var(--t-faint)" }}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {habits.map((habit) => (
            <div
              key={habit.habit_id}
              onClick={() => onOpen(habit)}
              className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-white/[0.04] cursor-pointer transition-colors opacity-50 hover:opacity-70"
            >
              <span className="text-base shrink-0">{habit.category_emoji ?? "🔄"}</span>
              <p
                className="flex-1 min-w-0 truncate line-through"
                style={{ fontSize: "var(--fs-secondary)", color: "var(--t-secondary)" }}
              >
                {habit.title}
              </p>
              {habit.current_streak > 0 && (
                <span
                  className="shrink-0 tabular-nums text-emerald-400/70"
                  style={{ fontSize: "var(--fs-badge)" }}
                >
                  🔥 {habit.current_streak}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
