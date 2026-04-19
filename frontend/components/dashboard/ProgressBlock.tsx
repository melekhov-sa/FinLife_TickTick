"use client";

import { clsx } from "clsx";
import type { LevelBlock, EfficiencyBlock, HeatmapCell } from "@/types/api";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n);
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

const SCORE_BARS = 10;

interface Props {
  level: LevelBlock | null;
  efficiency: EfficiencyBlock | null;
  cells: HeatmapCell[];
}

export function ProgressBlock({ level, efficiency, cells }: Props) {
  if (!level && !efficiency && cells.length === 0) return null;

  const effScore = efficiency?.score ?? 0;
  const effFilledBars = Math.round((effScore / 100) * SCORE_BARS);
  const effTier =
    effScore >= 80 ? { label: "Высокий", color: "text-emerald-400" } :
    effScore >= 55 ? { label: "Средний", color: "text-amber-400" } :
    { label: "Низкий", color: "text-red-400" };
  const effScoreColor =
    effScore >= 80 ? "text-emerald-400" :
    effScore >= 55 ? "text-amber-400" :
    "text-red-400";
  const effBarColor =
    effScore >= 80 ? "bg-emerald-500" :
    effScore >= 55 ? "bg-amber-500" :
    "bg-red-500";
  const effBarGlow =
    effScore >= 80 ? "rgba(16,185,129,0.5)" :
    effScore >= 55 ? "rgba(245,158,11,0.5)" :
    "rgba(239,68,68,0.4)";

  const levelPct = level ? Math.min(100, Math.round(level.percent_progress)) : 0;

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] rounded-xl md:rounded-[14px] border-[1.5px] border-slate-300 dark:border-white/[0.09] p-3.5 md:p-5 space-y-3 md:space-y-4">
      <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Продуктивность
      </h2>

      {/* ── Level + Efficiency: compact two-column layout ─────────── */}
      {(level || efficiency) && (
        <div className="flex gap-4 items-stretch">
          {/* Level column */}
          {level && (
            <div className="flex-1 min-w-0 flex flex-col">
              <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Уровень
              </p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span
                  className="text-[26px] md:text-[28px] font-bold tabular-nums leading-none"
                  style={{ letterSpacing: "-0.04em", color: "var(--t-primary)" }}
                >
                  {level.level}
                </span>
                <span className="text-[11px] tabular-nums font-medium" style={{ color: "var(--t-faint)" }}>
                  {fmt(level.current_level_xp)} / {fmt(level.xp_to_next_level)}
                </span>
              </div>
              <div className="mt-auto h-1 md:h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${levelPct}%`,
                    background: "linear-gradient(90deg, #6366f1, #818cf8)",
                    boxShadow: levelPct > 5 ? "0 0 8px rgba(99,102,241,0.6)" : "none",
                  }}
                />
              </div>
            </div>
          )}

          {/* Divider */}
          {level && efficiency && (
            <div className="w-px bg-slate-200 dark:bg-white/[0.06] self-stretch" />
          )}

          {/* Efficiency column */}
          {efficiency && (
            <div className="flex-1 min-w-0 flex flex-col">
              <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Эффективность
              </p>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className={clsx("text-[26px] md:text-[28px] font-bold tabular-nums leading-none", effScoreColor)} style={{ letterSpacing: "-0.04em" }}>
                  {effScore}
                </span>
                <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--t-faint)" }}>
                  / 100
                </span>
                <span className={clsx("ml-auto text-[10px] md:text-[11px] font-semibold", effTier.color)}>
                  {effTier.label}
                </span>
              </div>
              <div className="mt-auto flex gap-0.5 md:gap-1">
                {Array.from({ length: SCORE_BARS }).map((_, i) => (
                  <div
                    key={i}
                    className={clsx("flex-1 h-3 md:h-4 rounded transition-all", i < effFilledBars ? effBarColor : "bg-white/[0.05]")}
                    style={i < effFilledBars ? { boxShadow: `0 0 5px ${effBarGlow}` } : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Habit heatmap ─────────────────────────────────── */}
      {cells.length > 0 && (
        <div className={(level || efficiency) ? "border-t border-white/[0.05] pt-3 md:pt-4" : ""}>
          <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-widest mb-1.5 md:mb-2" style={{ color: "var(--t-faint)" }}>
            Привычки
          </p>
          <div className="flex gap-[2px] md:gap-[3px]">
            {cells.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.done_count}/${cell.due_count}`}
                className={clsx("flex-1 h-4 md:h-5 rounded transition-all cursor-default", LEVEL_CLASS[cell.level])}
                style={{ boxShadow: LEVEL_GLOW[cell.level] }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
