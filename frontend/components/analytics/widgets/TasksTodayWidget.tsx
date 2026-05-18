"use client";

import { useDashboard } from "@/hooks/useDashboard";
import type { WidgetProps } from "../types";

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-2 animate-pulse">
      <div className="h-8 w-20 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="h-2 w-full rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="h-3 w-16 rounded" style={{ background: "var(--c-neutral-bg)" }} />
    </div>
  );
}

export function TasksTodayWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading, isError } = useDashboard();

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const { total, done, left } = data.today.progress;
  const overdue = data.today.overdue.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && left === 0;

  return (
    <div className="h-full flex flex-col justify-center gap-2">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold tabular-nums leading-none"
          style={{
            color: allDone ? "var(--c-success-ink)" : "var(--t-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          {done}
        </span>
        <span className="text-[15px]" style={{ color: "var(--t-faint)" }}>
          / {total}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--c-neutral-bg)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: allDone ? "var(--c-success-ink)" : "var(--app-accent)",
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
          {total === 0
            ? "нет задач на сегодня"
            : allDone
              ? "все выполнено 🎉"
              : `осталось ${left}`}
        </span>
        {overdue > 0 && (
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--c-danger-ink)" }}
          >
            +{overdue} просроч.
          </span>
        )}
      </div>
    </div>
  );
}
