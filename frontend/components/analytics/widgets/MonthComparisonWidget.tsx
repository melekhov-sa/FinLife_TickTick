"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePrimaryCurrency } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface MonthBlock {
  income: number; expense: number; net: number;
  ops: number; tasks_done: number; habits_rate: number; label: string;
}
interface MonthComparisonResponse { current: MonthBlock; previous: MonthBlock; }

const CURRENCY_SYM: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

function Delta({ cur, prev, suffix = "", lowerIsBetter = false }: {
  cur: number; prev: number; suffix?: string; lowerIsBetter?: boolean;
}) {
  if (prev === 0) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>→</span>;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className="text-[9px] font-semibold" style={{ color: good ? "var(--c-success-ink)" : "var(--c-danger-ink)" }}>
      {up ? "▲" : "▼"}{Math.abs(pct)}%{suffix}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="h-full grid grid-cols-2 gap-3 animate-pulse">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 p-2 rounded-xl" style={{ background: "var(--c-neutral-bg)" }}>
          <div className="h-3 w-16 rounded" style={{ background: "var(--app-border)" }} />
          {[0, 1, 2].map((j) => (
            <div key={j} className="h-3 w-20 rounded" style={{ background: "var(--app-border)" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function MonthCol({ block, sym, isCurrent }: { block: MonthBlock; sym: string; isCurrent: boolean }) {
  return (
    <div
      className="flex flex-col gap-1.5 p-2.5 rounded-xl"
      style={{ background: isCurrent ? "color-mix(in srgb, var(--app-accent) 8%, transparent)" : "var(--c-neutral-bg)" }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider truncate"
        style={{ color: isCurrent ? "var(--app-accent)" : "var(--t-faint)" }}>
        {block.label}
      </span>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Доход</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-success-ink)" }}>
            +{sym}{fmt(block.income)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Расход</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-danger-ink)" }}>
            -{sym}{fmt(block.expense)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Итог</span>
          <span className="text-[12px] font-bold tabular-nums"
            style={{ color: block.net >= 0 ? "var(--t-primary)" : "var(--c-danger-ink)" }}>
            {block.net >= 0 ? "+" : ""}{sym}{fmt(block.net)}
          </span>
        </div>
        <div className="mt-0.5 pt-1.5 border-t flex items-center justify-between gap-1"
          style={{ borderColor: "var(--app-border)" }}>
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Задачи</span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--t-secondary)" }}>{block.tasks_done}</span>
        </div>
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>Привычки</span>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--t-secondary)" }}>{block.habits_rate}%</span>
        </div>
      </div>
    </div>
  );
}

export function MonthComparisonWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;

  const { data, isLoading } = useQuery<MonthComparisonResponse>({
    queryKey: ["analytics-month-comparison"],
    queryFn: () => api.get<MonthComparisonResponse>("/api/v2/analytics/month-comparison"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  const { current, previous } = data;

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-semibold" style={{ color: "var(--t-secondary)" }}>Сравнение месяцев</span>
        <Delta cur={current.net} prev={previous.net} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
        <MonthCol block={previous} sym={sym} isCurrent={false} />
        <MonthCol block={current} sym={sym} isCurrent />
      </div>
    </div>
  );
}
