"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StatBlock } from "@/components/primitives/StatBlock";
import type { WidgetProps } from "../types";

interface SubsResponse {
  total_monthly: number;
  count: number;
  subscriptions: { name: string; cost: number; days_left: number | null }[];
  expiring: { name: string; days_left: number; cost: number }[];
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-2 animate-pulse">
      <div className="h-8 w-24 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="h-3 w-20 rounded" style={{ background: "var(--c-neutral-bg)" }} />
    </div>
  );
}

function pluralize(n: number) {
  if (n === 1) return "подписка";
  if (n < 5) return "подписки";
  return "подписок";
}

export function SubscriptionsCostWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useQuery<SubsResponse>({
    queryKey: ["analytics-subscriptions"],
    queryFn: () => api.get<SubsResponse>("/api/v2/analytics/subscriptions-analytics"),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  const { total_monthly, count, expiring } = data;

  return (
    <div className="h-full flex flex-col justify-center gap-2">
      <StatBlock
        size="hero"
        value={`₴ ${total_monthly.toLocaleString("uk-UA")}`}
        sub={`${count} ${pluralize(count)} · в месяц`}
      />
      {expiring.length > 0 && (
        <span className="text-[11px] font-medium" style={{ color: "var(--c-warning-ink, #D97706)" }}>
          ⚠ {expiring[0].name} — через {expiring[0].days_left}д
        </span>
      )}
    </div>
  );
}
