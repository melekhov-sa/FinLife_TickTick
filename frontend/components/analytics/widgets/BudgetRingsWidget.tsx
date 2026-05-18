"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ProgressRing } from "@/components/primitives/ProgressRing";
import { usePrimaryCurrency, CURRENCY_SYM } from "../usePrimaryCurrency";
import { seriesColor } from "@/components/primitives/charts";
import type { WidgetProps } from "../types";

interface CategoryItem {
  category_name: string;
  category_id: number | null;
  amount: number;
  percent: number;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}к`;
  return String(Math.round(n));
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-2.5 animate-pulse">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="flex-1 flex flex-col gap-1">
            <div className="h-3 rounded" style={{ background: "var(--c-neutral-bg)", width: `${50 + i * 8}%` }} />
            <div className="h-2.5 w-14 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BudgetRingsWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;
  const period = new Date().toISOString().slice(0, 7);

  const { data, isLoading, isError } = useQuery<CategoryItem[]>({
    queryKey: ["analytics-category-breakdown", period, currency],
    queryFn: () =>
      api.get<CategoryItem[]>(
        `/api/v2/analytics/category-breakdown?period=${period}&currency=${currency}&op_type=EXPENSE`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const top5 = [...data].sort((a, b) => b.amount - a.amount).slice(0, 5);

  if (top5.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет расходов за этот месяц</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center gap-2">
      {top5.map((item, i) => (
        <div key={item.category_id ?? i} className="flex items-center gap-3">
          <ProgressRing
            value={item.percent}
            max={100}
            size={36}
            thickness={4}
            color={seriesColor(i)}
            autoComplete={false}
            center={
              <span style={{ fontSize: 8, fontWeight: 700, color: "var(--t-primary)" }}>
                {item.percent}%
              </span>
            }
            ariaLabel={`${item.category_name} ${item.percent}%`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
              {item.category_name}
            </p>
            <p className="text-[11px] tabular-nums" style={{ color: "var(--t-muted)" }}>
              {sym}{fmt(item.amount)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
