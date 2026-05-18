"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { useProductivity } from "../useProductivity";
import { StatBlock } from "@/components/primitives/StatBlock";
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_PAIR,
} from "@/components/primitives/charts";
import type { WidgetProps } from "../types";

function Skeleton() {
  return (
    <div className="h-full flex items-end gap-1 pb-2 animate-pulse">
      {[4, 7, 3, 8, 5, 6, 4, 9].map((h, i) => (
        <div key={i} className="flex-1 rounded-t"
          style={{ height: `${h * 10}%`, background: "var(--c-neutral-bg)" }} />
      ))}
    </div>
  );
}

export function TasksWeekWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useProductivity();

  if (isLoading || !data) return <Skeleton />;

  const { weekly_trend, done_7d, velocity_7d } = data.tasks;
  const points = weekly_trend.slice(-8);
  const currentWeek = points[points.length - 1];

  return (
    <div className="h-full flex flex-col gap-2 p-4">
      {/* Stats row */}
      <div className="flex items-center gap-4 shrink-0">
        <StatBlock size="compact" label="за 7 дней" value={String(done_7d)} />
        <div className="h-6 w-px" style={{ background: "var(--app-border)" }} />
        <StatBlock size="compact" label="задач/день" value={String(velocity_7d)} />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid {...CHART_GRID} vertical={false} />
            <XAxis dataKey="week" tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ ...CHART_AXIS, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [typeof v === "number" ? `${v} задач` : "", ""]}
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              cursor={{ fill: "rgba(99,102,241,.06)" }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {points.map((entry, i) => (
                <Cell
                  key={i}
                  fill={CHART_PAIR.accent}
                  fillOpacity={entry === currentWeek ? 1 : 0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
