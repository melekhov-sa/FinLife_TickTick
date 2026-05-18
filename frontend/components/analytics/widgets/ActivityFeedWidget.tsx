"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CURRENCY_SYM } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

type TransactionItem = {
  type: "transaction";
  title: string;
  amount: number;
  op_type: "INCOME" | "EXPENSE";
  currency: string;
  ts: string;
};

type TaskItem = { type: "task"; title: string; ts: string };
type HabitItem = { type: "habit"; title: string; ts: string };
type FeedItem = TransactionItem | TaskItem | HabitItem;

interface FeedResponse {
  items: FeedItem[];
}

function timeLabel(ts: string): string {
  const isDateOnly = ts.length === 10;
  const d = new Date(isDateOnly ? ts + "T00:00:00" : ts);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86_400_000).toDateString();
  if (d.toDateString() === todayStr) {
    return isDateOnly ? "сегодня" : d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.toDateString() === yesterdayStr) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const TYPE_ICON: Record<string, string> = {
  task: "✅",
  habit: "🔥",
};

function ItemRow({ item }: { item: FeedItem }) {
  const icon = item.type === "transaction"
    ? (item.op_type === "INCOME" ? "💰" : "💸")
    : TYPE_ICON[item.type];

  return (
    <div
      className="flex items-center gap-2 py-2 border-t first:border-0"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="shrink-0 text-[13px] leading-none">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
          {item.title}
        </p>
        {item.type === "transaction" && (
          <p
            className="text-[11px] tabular-nums font-semibold"
            style={{ color: item.op_type === "INCOME" ? "var(--c-success-ink)" : "var(--c-danger-ink)" }}
          >
            {item.op_type === "INCOME" ? "+" : "−"}
            {CURRENCY_SYM[item.currency] ?? item.currency}
            {item.amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
        {timeLabel(item.ts)}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-0 animate-pulse">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2.5 py-2 border-t first:border-0" style={{ borderColor: "var(--app-border)" }}>
          <div className="w-4 h-4 rounded-full shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="flex-1 flex flex-col gap-1">
            <div className="h-3 rounded" style={{ background: "var(--c-neutral-bg)", width: `${55 + i * 8}%` }} />
            <div className="h-2.5 w-12 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
          <div className="w-8 h-2.5 rounded shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading, isError } = useQuery<FeedResponse>({
    queryKey: ["analytics-activity-feed"],
    queryFn: () => api.get<FeedResponse>("/api/v2/analytics/activity-feed"),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  if (data.items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет активности за неделю</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {data.items.map((item, i) => (
        <ItemRow key={i} item={item} />
      ))}
    </div>
  );
}
