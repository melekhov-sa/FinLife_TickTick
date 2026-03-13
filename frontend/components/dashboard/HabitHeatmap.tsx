"use client";

import { clsx } from "clsx";
import type { HeatmapCell } from "@/types/api";

interface Props {
  cells: HeatmapCell[];
}

const LEVEL_CLASS = [
  "bg-white/[0.04]",
  "bg-indigo-500/20",
  "bg-indigo-500/35",
  "bg-indigo-500/55",
  "bg-indigo-500/80",
];

export function HabitHeatmap({ cells }: Props) {
  if (cells.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-medium text-white/60 mb-4">Habits</h2>
      <div className="flex gap-1">
        {cells.map((cell) => (
          <div
            key={cell.date}
            title={`${cell.date}: ${cell.done_count}/${cell.due_count}`}
            className={clsx(
              "flex-1 h-6 rounded-sm transition-colors",
              LEVEL_CLASS[cell.level]
            )}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-white/20">
          {cells[0]?.date?.slice(5)}
        </span>
        <span className="text-[10px] text-white/20">
          {cells[cells.length - 1]?.date?.slice(5)}
        </span>
      </div>
    </div>
  );
}
