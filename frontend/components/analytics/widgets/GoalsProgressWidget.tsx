"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GoalCard } from "@/components/primitives/GoalCard";
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

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}к`;
  return String(Math.round(n));
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-3 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "var(--c-neutral-bg)" }}>
          <div className="w-14 h-14 rounded-full shrink-0" style={{ background: "var(--app-border)" }} />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-28 rounded" style={{ background: "var(--app-border)" }} />
            <div className="h-2.5 w-20 rounded" style={{ background: "var(--app-border)" }} />
          </div>
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
    <div className="h-full flex flex-col gap-2 overflow-y-auto">
      {goals.map((goal, i) => {
        const sym = CURRENCY_SYM[goal.currency] ?? goal.currency;
        const done = goal.current >= goal.target && goal.target > 0;
        return (
          <GoalCard
            key={i}
            title={goal.title}
            current={goal.current}
            target={goal.target}
            ringSize={52}
            ringTone={done ? "success" : "accent"}
            currentNode={<>{sym}{fmt(goal.current)}</>}
            targetNode={<>{sym}{fmt(goal.target)}</>}
          />
        );
      })}
    </div>
  );
}
