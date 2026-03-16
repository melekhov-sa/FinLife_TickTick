"use client";

import { clsx } from "clsx";
import type { EfficiencyBlock } from "@/types/api";

interface Props {
  efficiency: EfficiencyBlock;
}

const SCORE_BARS = 10;

export function EfficiencyCard({ efficiency }: Props) {
  const score = efficiency.score;
  const filledBars = Math.round((score / 100) * SCORE_BARS);

  const tier =
    score >= 80 ? { label: "Высокий", color: "text-emerald-400" } :
    score >= 55 ? { label: "Средний", color: "text-amber-400" } :
    { label: "Низкий", color: "text-red-400" };

  const scoreColor =
    score >= 80 ? "text-emerald-400" :
    score >= 55 ? "text-amber-400" :
    "text-red-400";

  const barColor =
    score >= 80 ? "bg-emerald-500" :
    score >= 55 ? "bg-amber-500" :
    "bg-red-500";

  const barGlow =
    score >= 80 ? "rgba(16,185,129,0.5)" :
    score >= 55 ? "rgba(245,158,11,0.5)" :
    "rgba(239,68,68,0.4)";

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-semibold mb-4" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Эффективность
      </h2>

      <div className="flex items-end justify-between mb-4">
        <div className="flex items-end gap-2">
          <span
            className={clsx("text-[42px] font-bold tabular-nums leading-none", scoreColor)}
            style={{ letterSpacing: "-0.04em" }}
          >
            {score}
          </span>
          <span className="text-sm pb-1 font-medium" style={{ color: "var(--t-muted)" }}>/ 100</span>
        </div>
        <span className={clsx("text-xs font-semibold pb-1", tier.color)}>
          {tier.label}
        </span>
      </div>

      {/* Bar chart */}
      <div className="flex gap-1">
        {Array.from({ length: SCORE_BARS }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "flex-1 h-6 rounded-md transition-all",
              i < filledBars ? barColor : "bg-white/[0.05]"
            )}
            style={
              i < filledBars
                ? { boxShadow: `0 0 6px ${barGlow}` }
                : undefined
            }
          />
        ))}
      </div>

      {efficiency.snapshot_date && (
        <p className="text-[11px] mt-2.5" style={{ color: "var(--t-faint)" }}>
          Индекс за 7 дней · {efficiency.snapshot_date}
        </p>
      )}
    </div>
  );
}
