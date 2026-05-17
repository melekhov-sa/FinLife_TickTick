"use client";

import { useProductivity } from "../useProductivity";
import type { WidgetProps } from "../types";

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-2 animate-pulse">
      <div className="h-8 w-16 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="h-3 w-24 rounded" style={{ background: "var(--c-neutral-bg)" }} />
    </div>
  );
}

export function TasksOverdueWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useProductivity();

  if (isLoading || !data) return <Skeleton />;

  const { overdue, active, done_30d } = data.tasks;
  const allGood = overdue === 0;

  return (
    <div className="h-full flex flex-col justify-center gap-1.5">
      <span
        className="text-[32px] font-bold tabular-nums leading-none"
        style={{
          color: allGood ? "var(--c-success-ink)" : "var(--c-danger-ink)",
          letterSpacing: "-0.02em",
        }}
      >
        {overdue}
      </span>
      <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>
        {allGood ? "просроченных нет 🎉" : `просроченных задач`}
      </span>
      <div className="mt-1 flex flex-col gap-0.5">
        <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
          активных: {active}
        </span>
        <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
          выполнено за 30д: {done_30d}
        </span>
      </div>
    </div>
  );
}
