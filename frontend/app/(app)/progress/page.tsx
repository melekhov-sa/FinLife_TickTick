"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";
import { api } from "@/lib/api";
import { clsx } from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TasksOverview {
  kpi: {
    done_cur: number;
    done_prev: number;
    avg_per_day: number;
    on_time_rate: number | null;
    completion_rate: number | null;
  };
  heatmap: { date: string; count: number }[];
  categories: { category_id: number | null; title: string; emoji: string | null; count: number; pct: number }[];
  weekdays: { day: string; avg: number; total: number }[];
  habits: {
    habit_id: number;
    title: string;
    emoji: string | null;
    current_streak: number;
    best_streak: number;
    done_30d: number;
    rate_30d: number;
    weekly_rates: number[];
  }[];
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useTasksOverview() {
  return useQuery<TasksOverview>({
    queryKey: ["analytics", "tasks-overview"],
    queryFn: () => api.get<TasksOverview>("/api/v2/analytics/tasks-overview"),
    staleTime: 2 * 60_000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trendPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span
      className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
      style={{
        background: up ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
        color: up ? "#10b981" : "#ef4444",
      }}
    >
      {up ? "+" : ""}{value}%
    </span>
  );
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

const HEATMAP_COLORS = [
  "rgba(255,255,255,0.04)",   // 0
  "rgba(99,102,241,0.25)",    // 1
  "rgba(99,102,241,0.45)",    // 2–3
  "rgba(99,102,241,0.65)",    // 4–6
  "rgba(99,102,241,0.88)",    // 7+
];

function heatColor(count: number): string {
  if (count === 0) return HEATMAP_COLORS[0];
  if (count === 1) return HEATMAP_COLORS[1];
  if (count <= 3) return HEATMAP_COLORS[2];
  if (count <= 6) return HEATMAP_COLORS[3];
  return HEATMAP_COLORS[4];
}

function TaskHeatmap({ data }: { data: { date: string; count: number }[] }) {
  const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  const RU_DAYS = ["Пн","","Ср","","Пт","",""];

  // Group into 13 columns of 7 (weeks), starting from Monday
  const weeks: { date: string; count: number }[][] = [];
  let week: { date: string; count: number }[] = [];

  // Pad front so first day is correct weekday (Mon=0)
  const first = new Date(data[0].date + "T00:00:00");
  const padDays = (first.getDay() + 6) % 7;
  for (let i = 0; i < padDays; i++) week.push({ date: "", count: -1 });

  for (const d of data) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) {
    while (week.length < 7) week.push({ date: "", count: -1 });
    weeks.push(week);
  }

  // Month labels: show month name when week crosses month boundary
  const monthLabels: (string | null)[] = weeks.map((wk) => {
    const firstReal = wk.find(d => d.date && d.count >= 0);
    if (!firstReal) return null;
    const d = new Date(firstReal.date + "T00:00:00");
    if (d.getDate() <= 7) return RU_MONTHS[d.getMonth()];
    return null;
  });

  return (
    <div>
      {/* Month row */}
      <div className="flex gap-[3px] mb-1 pl-6">
        {monthLabels.map((m, i) => (
          <div key={i} className="w-[13px] shrink-0 text-[9px]" style={{ color: "var(--t-faint)" }}>
            {m ?? ""}
          </div>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {/* Day labels */}
        <div className="flex flex-col gap-[3px] mr-1">
          {RU_DAYS.map((d, i) => (
            <div key={i} className="h-[13px] text-[9px] flex items-center" style={{ color: "var(--t-faint)" }}>
              {d}
            </div>
          ))}
        </div>
        {/* Grid */}
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {wk.map((cell, di) => (
              <div
                key={di}
                title={cell.date ? `${cell.date}: ${cell.count} задач` : ""}
                style={{
                  width: 13, height: 13,
                  borderRadius: 3,
                  background: cell.count < 0 ? "transparent" : heatColor(cell.count),
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Меньше</span>
        {HEATMAP_COLORS.map((c, i) => (
          <div key={i} style={{ width: 11, height: 11, borderRadius: 2, background: c, border: "1px solid rgba(255,255,255,0.06)" }} />
        ))}
        <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Больше</span>
      </div>
    </div>
  );
}

// ── Weekday chart ─────────────────────────────────────────────────────────────

function WeekdayChart({ data }: { data: { day: string; avg: number; total: number }[] }) {
  const max = Math.max(...data.map(d => d.avg), 0.1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((d) => {
        const pct = (d.avg / max) * 100;
        const isTop = d.avg === max && max > 0;
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium tabular-nums" style={{ color: "var(--t-faint)" }}>
              {d.avg > 0 ? d.avg : ""}
            </span>
            <div className="w-full rounded-t-md transition-all" style={{
              height: `${Math.max(pct, 4)}%`,
              background: isTop
                ? "linear-gradient(180deg, #818cf8, #6366f1)"
                : "rgba(99,102,241,0.25)",
              minHeight: 4,
            }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--t-secondary)" }}>{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Habit row ─────────────────────────────────────────────────────────────────

function HabitRow({ habit }: { habit: TasksOverview["habits"][0] }) {
  const maxRate = 100;
  const trend = habit.weekly_rates.length >= 2
    ? habit.weekly_rates[habit.weekly_rates.length - 1] - habit.weekly_rates[0]
    : 0;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0">
      {/* Emoji / streak */}
      <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 text-sm">
        {habit.emoji ?? "🎯"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[13px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
            {habit.title}
          </span>
          {trend !== 0 && (
            <span className="text-[10px] font-semibold shrink-0" style={{ color: trend > 0 ? "#10b981" : "#ef4444" }}>
              {trend > 0 ? "↑" : "↓"}{Math.abs(trend)}%
            </span>
          )}
        </div>
        {/* 4-week mini bars */}
        <div className="flex items-end gap-1 h-4">
          {habit.weekly_rates.map((r, i) => {
            const isCur = i === habit.weekly_rates.length - 1;
            return (
              <div
                key={i}
                title={`${r}%`}
                className="flex-1 rounded-sm transition-all"
                style={{
                  height: `${Math.max((r / maxRate) * 100, 8)}%`,
                  background: isCur
                    ? (r >= 70 ? "#10b981" : r >= 40 ? "#f59e0b" : "#ef4444")
                    : "rgba(255,255,255,0.08)",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Streak */}
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 justify-end">
          <span className="text-[11px]">🔥</span>
          <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
            {habit.current_streak}
          </span>
        </div>
        <div className="text-[10px]" style={{ color: "var(--t-faint)" }}>
          {habit.rate_30d}% / 30д
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const { data, isLoading, isError } = useTasksOverview();

  const trend = data ? trendPct(data.kpi.done_cur, data.kpi.done_prev) : null;

  return (
    <>
      <PageHeader title="Прогресс" density="compact" />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full max-w-4xl mx-auto">
        {isLoading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rect" height={80} className="rounded-2xl" />)}
            </div>
            <Skeleton variant="rect" height={120} className="rounded-2xl" />
            <Skeleton variant="rect" height={200} className="rounded-2xl" />
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-16">Не удалось загрузить статистику</p>
        )}

        {data && (
          <div className="space-y-4 md:space-y-5">

            {/* ── KPI row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Done this month */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                <p className="text-[11px] font-medium mb-1" style={{ color: "var(--t-faint)" }}>Закрыто в месяце</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: "var(--t-primary)" }}>
                    {data.kpi.done_cur}
                  </span>
                  <TrendBadge value={trend} />
                </div>
                <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
                  пред. месяц: {data.kpi.done_prev}
                </p>
              </div>

              {/* Avg per day */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                <p className="text-[11px] font-medium mb-1" style={{ color: "var(--t-faint)" }}>В среднем в день</p>
                <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: "var(--t-primary)" }}>
                  {data.kpi.avg_per_day}
                </span>
                <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>задач/день</p>
              </div>

              {/* Completion rate */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                <p className="text-[11px] font-medium mb-1" style={{ color: "var(--t-faint)" }}>Закрытых в срок</p>
                <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: "var(--t-primary)" }}>
                  {data.kpi.completion_rate != null ? `${data.kpi.completion_rate}%` : "—"}
                </span>
                <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>этот месяц</p>
              </div>

              {/* On-time rate */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                <p className="text-[11px] font-medium mb-1" style={{ color: "var(--t-faint)" }}>Вовремя (30д)</p>
                <span
                  className="text-[28px] font-bold tabular-nums leading-none"
                  style={{
                    color: data.kpi.on_time_rate == null ? "var(--t-faint)"
                      : data.kpi.on_time_rate >= 70 ? "#10b981"
                      : data.kpi.on_time_rate >= 40 ? "#f59e0b"
                      : "#ef4444",
                  }}
                >
                  {data.kpi.on_time_rate != null ? `${data.kpi.on_time_rate}%` : "—"}
                </span>
                <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>от задач с дедлайном</p>
              </div>
            </div>

            {/* ── Heatmap ──────────────────────────────────────────────── */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 md:p-5 overflow-x-auto">
              <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--t-secondary)" }}>
                13 недель активности
              </p>
              <TaskHeatmap data={data.heatmap} />
            </div>

            {/* ── Categories + Weekday side-by-side ────────────────────── */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Categories */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 md:p-5">
                <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--t-secondary)" }}>
                  По категориям · 30 дней
                </p>
                {data.categories.length === 0 && (
                  <p className="text-[12px] py-4 text-center" style={{ color: "var(--t-faint)" }}>Нет данных</p>
                )}
                <div className="space-y-2.5">
                  {data.categories.slice(0, 7).map((cat) => (
                    <div key={cat.category_id ?? "none"}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium flex items-center gap-1.5" style={{ color: "var(--t-secondary)" }}>
                          {cat.emoji && <span>{cat.emoji}</span>}
                          {cat.title}
                        </span>
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                          {cat.count} · {cat.pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${cat.pct}%`,
                            background: "linear-gradient(90deg, #6366f1, #818cf8)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weekday rhythm */}
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 md:p-5">
                <p className="text-[12px] font-semibold mb-3" style={{ color: "var(--t-secondary)" }}>
                  Ритм по дням недели
                </p>
                <p className="text-[11px] mb-4" style={{ color: "var(--t-faint)" }}>
                  Среднее кол-во задач за 90 дней
                </p>
                <WeekdayChart data={data.weekdays} />
              </div>
            </div>

            {/* ── Habits ───────────────────────────────────────────────── */}
            {data.habits.length > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 md:p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--t-secondary)" }}>
                    Привычки
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--t-faint)" }}>
                    4 недели · серый = старше, цвет = сейчас
                  </p>
                </div>
                <div>
                  {data.habits.map((h) => (
                    <HabitRow key={h.habit_id} habit={h} />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </>
  );
}
