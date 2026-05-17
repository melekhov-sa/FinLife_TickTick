"use client";

import { useProductivity } from "../useProductivity";
import type { WidgetProps } from "../types";

const DAYS_RU = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function cellColor(done: number, total: number): string {
  if (total === 0) return "var(--c-neutral-bg)";
  const pct = done / total;
  if (pct === 0) return "var(--c-neutral-bg)";
  if (pct < 0.34) return "color-mix(in srgb, var(--app-accent) 25%, transparent)";
  if (pct < 0.67) return "color-mix(in srgb, var(--app-accent) 55%, transparent)";
  if (pct < 1)   return "color-mix(in srgb, var(--app-accent) 80%, transparent)";
  return "var(--app-accent)";
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-2 animate-pulse">
      <div className="h-3 w-24 rounded" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex-1 grid gap-1" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="rounded aspect-square" style={{ background: "var(--c-neutral-bg)" }} />
        ))}
      </div>
    </div>
  );
}

export function HabitsHeatmapWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useProductivity();

  if (isLoading || !data) return <Skeleton />;

  const { daily_chart, rate_30d } = data.habits;

  // Build a lookup: "DD.MM" → {done, total}
  const lookup = new Map(daily_chart.map((d) => [d.day, d]));

  // Build last 35 days (5 complete weeks) ending today
  const today = new Date();
  // Align to end of current week (Sunday = 0 → Monday start)
  const todayDow = today.getDay(); // 0=Sun
  const daysToSunday = todayDow === 0 ? 0 : 7 - todayDow;
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + daysToSunday);

  const cells: { label: string; key: string; done: number; total: number; isFuture: boolean }[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - i);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const key = `${dd}.${mm}`;
    const entry = lookup.get(key);
    cells.push({
      label: dd,
      key,
      done: entry?.done ?? 0,
      total: entry?.total ?? 0,
      isFuture: d > today,
    });
  }

  // Find weeks to show month label transitions
  const monthLabels: (string | null)[] = cells.map((c, i) => {
    if (i % 7 !== 0) return null;
    const [dd, mm] = c.key.split(".").map(Number);
    const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    // show month label only when month changes within this row
    if (i === 0) return months[mm - 1];
    const prev = cells[i - 1];
    const [, prevMm] = prev.key.split(".").map(Number);
    return mm !== prevMm ? months[mm - 1] : null;
  });

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[12px] font-semibold" style={{ color: "var(--t-secondary)" }}>
          Карта привычек · 5 недель
        </span>
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--app-accent)" }}>
          {rate_30d}% за 30д
        </span>
      </div>

      {/* Day-of-week headers */}
      <div className="grid gap-1 shrink-0" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {DAYS_RU.map((d) => (
          <div key={d} className="text-center text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--t-faint)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid gap-1 content-start" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((cell, i) => {
          const bg = cell.isFuture
            ? "transparent"
            : cellColor(cell.done, cell.total);
          const title = cell.isFuture
            ? cell.key
            : `${cell.key}: ${cell.done}/${cell.total} привычек`;
          return (
            <div
              key={i}
              title={title}
              className="rounded aspect-square cursor-default transition-transform hover:scale-110"
              style={{
                background: bg,
                border: cell.isFuture ? "1px dashed var(--app-border)" : "none",
                opacity: cell.isFuture ? 0.4 : 1,
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 shrink-0 justify-end">
        <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>меньше</span>
        {[0.15, 0.35, 0.6, 0.85, 1].map((pct, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-sm"
            style={{
              background: pct === 0.15
                ? "var(--c-neutral-bg)"
                : `color-mix(in srgb, var(--app-accent) ${Math.round(pct * 100)}%, transparent)`,
            }}
          />
        ))}
        <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>больше</span>
      </div>
    </div>
  );
}
