"use client";

import { useProductivity } from "../useProductivity";
import { Heatmap, type HeatmapCell } from "@/components/primitives/Heatmap";
import type { WidgetProps } from "../types";

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-3 animate-pulse">
      <div className="h-3 w-24 rounded" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex gap-1">
        {Array.from({ length: 13 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="w-3 h-3 rounded-sm" style={{ background: "var(--c-neutral-bg)" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HabitsHeatmapWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useProductivity();

  if (isLoading || !data) return <Skeleton />;

  const { daily_chart, rate_30d } = data.habits;

  if (daily_chart.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет данных о привычках</p>
      </div>
    );
  }

  const cells: HeatmapCell[] = daily_chart
    .filter((d) => d.total > 0)
    .map((d) => ({
      date: d.date,
      value: d.done,
      label: `${d.done} из ${d.total} привычек`,
    }));

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Rate badge */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
          13 недель
        </span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-accent)" }}>
          {rate_30d}% за 30д
        </span>
      </div>

      {/* Heatmap — overflow-x: auto для узких контейнеров */}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <Heatmap
          cells={cells}
          weeks={13}
          cellSize={12}
          gap={3}
          showWeekdays
          showMonths
          showLegend
          formatTooltip={(c) => (
            <>
              <div style={{ fontWeight: 600 }}>
                {new Date(c.date + "T00:00:00").toLocaleDateString("ru-RU", {
                  day: "numeric", month: "long",
                })}
              </div>
              <div style={{ color: "var(--t-muted)", marginTop: 2 }}>
                {c.label ?? (c.value === 0 ? "нет выполненных" : `${c.value} привычек`)}
              </div>
            </>
          )}
        />
      </div>
    </div>
  );
}
