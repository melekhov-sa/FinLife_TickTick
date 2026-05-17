"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { useProductivity } from "../useProductivity";
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
    <div className="h-full flex flex-col gap-2">
      {/* Stats row */}
      <div className="flex items-center gap-4 shrink-0">
        <div>
          <span className="text-[22px] font-bold tabular-nums leading-none"
            style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}>
            {done_7d}
          </span>
          <span className="text-[11px] ml-1" style={{ color: "var(--t-muted)" }}>за 7 дней</span>
        </div>
        <div className="h-6 w-px" style={{ background: "var(--app-border)" }} />
        <div>
          <span className="text-[22px] font-bold tabular-nums leading-none"
            style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}>
            {velocity_7d}
          </span>
          <span className="text-[11px] ml-1" style={{ color: "var(--t-muted)" }}>задач/день</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--app-border)" strokeDasharray="3 3" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--t-faint)" }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--t-faint)" }}
              axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              formatter={(v: number) => [`${v} задач`, ""]}
              contentStyle={{
                background: "var(--app-card-bg)", border: "1px solid var(--app-border)",
                borderRadius: 10, fontSize: 12, color: "var(--t-primary)",
              }}
              cursor={{ fill: "var(--c-neutral-bg)", radius: 4 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {points.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry === currentWeek ? "var(--app-accent)" : "#6366F1"}
                  fillOpacity={entry === currentWeek ? 1 : 0.45}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
