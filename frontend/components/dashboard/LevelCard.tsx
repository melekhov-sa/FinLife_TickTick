"use client";

import type { LevelBlock } from "@/types/api";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n);
}

interface Props {
  level: LevelBlock;
}

export function LevelCard({ level }: Props) {
  const pct = Math.min(100, Math.round(level.percent_progress));

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-semibold mb-4" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Уровень
      </h2>

      <div className="flex items-end gap-3 mb-3">
        <span
          className="text-[42px] font-bold tabular-nums leading-none"
          style={{ letterSpacing: "-0.04em", color: "var(--t-primary)" }}
        >
          {level.level}
        </span>
        <div className="pb-1 space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-muted)" }}>
            Уровень
          </p>
          <p className="text-xs tabular-nums" style={{ color: "var(--t-secondary)" }}>
            {fmt(level.current_level_xp)} / {fmt(level.xp_to_next_level)} XP
          </p>
        </div>
      </div>

      {/* XP progress bar with glow */}
      <div className="h-2 bg-white/[0.07] rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #6366f1, #818cf8)",
            boxShadow: pct > 5 ? "0 0 8px rgba(99,102,241,0.6)" : "none",
          }}
        />
      </div>

      <div className="flex justify-between text-[11px]">
        <span style={{ color: "var(--t-secondary)" }}>
          Этот месяц:{" "}
          <span className="text-indigo-400 font-semibold tabular-nums">
            {fmt(level.xp_this_month)} XP
          </span>
        </span>
        <span className="tabular-nums" style={{ color: "var(--t-faint)" }}>{fmt(level.total_xp)} всего</span>
      </div>
    </div>
  );
}
