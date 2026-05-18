"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ProgressRing } from "@/components/primitives/ProgressRing";
import type { WidgetProps } from "../types";

interface ProductivityData {
  tasks: {
    done_7d: number;
    velocity_7d: number;
  };
  habits: {
    rate_7d: number;
    daily_chart: Array<{ date: string; done: number; total: number }>;
  };
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 animate-pulse">
      <div className="w-[72px] h-[72px] rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-4 w-8 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-2.5 w-12 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeeklyScoreWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading, isError } = useQuery<ProductivityData>({
    queryKey: ["analytics-productivity"],
    queryFn: () => api.get<ProductivityData>("/api/v2/analytics/productivity"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const habitsRate = data.habits.rate_7d;
  const tasksDone = data.tasks.done_7d;
  const daily = data.habits.daily_chart.slice(-7);

  const tone = habitsRate >= 80 ? "success" : habitsRate >= 50 ? "accent" : "warning";

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <ProgressRing
        value={habitsRate}
        max={100}
        size={72}
        color={tone}
        autoComplete={false}
        center={
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: "var(--t-primary)",
          }}>
            {habitsRate}%
          </span>
        }
        ariaLabel={`Выполнение привычек за неделю ${habitsRate}%`}
      />

      <div className="flex items-center justify-center gap-5">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[14px] font-bold tabular-nums leading-none" style={{ color: "var(--t-primary)" }}>
            {tasksDone}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-faint)" }}>
            задач
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[14px] font-bold tabular-nums leading-none" style={{ color: "var(--t-primary)" }}>
            {habitsRate}%
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t-faint)" }}>
            привычек
          </span>
        </div>
      </div>

      {daily.length > 0 && (
        <div className="flex items-end gap-0.5 w-full" style={{ height: 18 }}>
          {daily.map((d, i) => {
            const pct = d.total > 0 ? d.done / d.total : 0;
            const color = pct >= 1
              ? "var(--c-success-ink)"
              : pct > 0
              ? "var(--app-accent)"
              : "var(--app-border)";
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all"
                style={{ height: Math.max(3, Math.round(pct * 18)), background: color, opacity: pct === 0 ? 0.5 : 1 }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
