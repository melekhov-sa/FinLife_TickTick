"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ProgressRing } from "@/components/primitives/ProgressRing";
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

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 animate-pulse">
      <div className="w-[72px] h-[72px] rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-3 w-20 rounded" style={{ background: "var(--c-neutral-bg)" }} />
        <div className="h-2.5 w-14 rounded" style={{ background: "var(--c-neutral-bg)" }} />
      </div>
    </div>
  );
}

export function GoalsSummaryWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading, isError } = useQuery<GoalsResponse>({
    queryKey: ["analytics-goals-progress"],
    queryFn: () => api.get<GoalsResponse>("/api/v2/analytics/goals-progress"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const goals = data.goals;

  if (goals.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет активных целей</p>
      </div>
    );
  }

  const withTarget = goals.filter((g) => g.target > 0);
  const avgPct = withTarget.length > 0
    ? Math.round(withTarget.reduce((s, g) => s + g.percent, 0) / withTarget.length)
    : 0;
  const done = withTarget.filter((g) => g.percent >= 100).length;
  const total = goals.length;
  const isAllDone = done === total && total > 0;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <ProgressRing
        value={avgPct}
        max={100}
        size={72}
        color={isAllDone ? "success" : "accent"}
        autoComplete={false}
        center={
          <span style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: isAllDone ? "var(--c-success-ink)" : "var(--t-primary)",
          }}>
            {avgPct}%
          </span>
        }
        ariaLabel={`Средний прогресс по целям ${avgPct}%`}
      />

      <div className="flex flex-col items-center gap-0.5 text-center">
        <p className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          {done > 0
            ? `${done} из ${total} ${plural(total, "цели", "целей", "целей")}`
            : `${total} ${plural(total, "цель", "цели", "целей")}`}
        </p>
        <p className="text-[11px]" style={{ color: "var(--t-muted)" }}>
          {isAllDone ? "все выполнено 🎉" : "средний прогресс"}
        </p>
      </div>
    </div>
  );
}
