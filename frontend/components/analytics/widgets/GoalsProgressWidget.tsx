"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CURRENCY_SYM } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface GoalItem {
  title: string;
  current: number;
  target: number;
  percent: number;
  currency: string;
}

interface GoalsResponse {
  goals: GoalItem[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}к`;
  return String(Math.round(n));
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <div className="h-3 w-24 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-3 w-10 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
          <div className="h-1.5 w-full rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}

export function GoalsProgressWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useQuery<GoalsResponse>({
    queryKey: ["analytics-goals-progress"],
    queryFn: () => api.get<GoalsResponse>("/api/v2/analytics/goals-progress"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  const goals = data.goals;

  if (goals.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет активных целей</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-2.5 overflow-hidden">
      {goals.map((goal, i) => {
        const sym = CURRENCY_SYM[goal.currency] ?? goal.currency;
        const pct = Math.min(goal.percent, 100);
        const done = pct >= 100;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
                {done && <span className="mr-1">✅</span>}{goal.title}
              </span>
              <span className="text-[11px] tabular-nums shrink-0 font-semibold"
                style={{ color: done ? "var(--c-success-ink)" : "var(--app-accent)" }}>
                {pct}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-neutral-bg)" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: done ? "var(--c-success-ink)" : "var(--app-accent)" }} />
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                {sym}&nbsp;{fmt(goal.current)}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                {sym}&nbsp;{fmt(goal.target)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
