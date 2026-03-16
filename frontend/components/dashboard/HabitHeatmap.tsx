"use client";

import { clsx } from "clsx";
import type { HeatmapCell } from "@/types/api";

interface Props {
  cells: HeatmapCell[];
}

const LEVEL_CLASS = [
  "bg-white/[0.05]",
  "bg-indigo-500/[0.22]",
  "bg-indigo-500/[0.38]",
  "bg-indigo-500/[0.58]",
  "bg-indigo-500/[0.82]",
];

const LEVEL_GLOW = [
  "none",
  "none",
  "0 0 4px rgba(99,102,241,0.3)",
  "0 0 6px rgba(99,102,241,0.45)",
  "0 0 8px rgba(99,102,241,0.6)",
];

export function HabitHeatmap({ cells }: Props) {
  if (cells.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-[14px] border border-white/[0.06] p-5">
      <h2 className="text-sm font-semibold mb-3" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Привычки
      </h2>
      <div className="flex gap-[3px]">
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.done_count}/${cell.due_count}`}
            className={clsx(
              "flex-1 h-7 rounded transition-all cursor-default",
              LEVEL_CLASS[cell.level]
            )}
            style={{ boxShadow: LEVEL_GLOW[cell.level] }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        <span className="t-secondary tabular-nums" style={{ color: "var(--t-faint)" }}>
          {cells[0]?.date?.slice(5)}
        </span>
        <span className="t-secondary tabular-nums" style={{ color: "var(--t-faint)" }}>
          {cells[cells.length - 1]?.date?.slice(5)}
        </span>
      </div>
    </div>
  );
}
