"use client";

import { Flame } from "lucide-react";
import { clsx } from "clsx";

interface Props {
  total: number;
  doneCount: number;
}

export function HeroBlock({ total, doneCount }: Props) {
  const allDone = total > 0 && doneCount === total;
  const noneScheduled = total === 0;
  const remaining = total - doneCount;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div
      className={clsx(
        "rounded-2xl p-5 border transition-all",
        allDone
          ? "bg-emerald-500/10 border-emerald-500/25"
          : "bg-white/[0.05] border-white/[0.08]"
      )}
    >
      {noneScheduled ? (
        <p style={{ fontSize: "var(--fs-body)", color: "var(--t-muted)" }}>
          Сегодня нет запланированных привычек
        </p>
      ) : allDone ? (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Flame size={20} className="text-emerald-400" />
          </div>
          <div>
            <p
              className="font-bold leading-tight"
              style={{ fontSize: "var(--fs-hero)", color: "var(--t-primary)" }}
            >
              Отлично! Все выполнены
            </p>
            <p style={{ fontSize: "var(--fs-caption)", color: "var(--t-muted)" }}>
              {doneCount} из {total} привычек сегодня
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span
              className="font-bold tabular-nums leading-none"
              style={{ fontSize: "var(--fs-hero)", color: "var(--t-primary)", letterSpacing: "-0.03em" }}
            >
              Сегодня
            </span>
            <span
              className="font-semibold tabular-nums"
              style={{ fontSize: "var(--fs-title)", color: "var(--t-secondary)" }}
            >
              {doneCount} из {total}
            </span>
          </div>
          <p style={{ fontSize: "var(--fs-caption)", color: "var(--t-muted)" }} className="mb-3">
            {remaining === 1 ? "Осталась 1 привычка" : `Осталось ${remaining} привычки`}
          </p>
          {/* Progress bar */}
          <div className="h-2 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p
            className="mt-1 tabular-nums text-right"
            style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}
          >
            {pct}%
          </p>
        </>
      )}
    </div>
  );
}
