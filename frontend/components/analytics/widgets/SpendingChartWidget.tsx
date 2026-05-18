"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DonutChart, seriesColor } from "@/components/primitives/charts";
import { usePrimaryCurrency, CURRENCY_SYM } from "../usePrimaryCurrency";
import { useWidgetScale } from "@/components/primitives/ScaleContext";
import type { WidgetProps } from "../types";

interface CategoryItem {
  category_name: string;
  category_id: number | null;
  amount: number;
  percent: number;
}

function Skeleton() {
  return (
    <div className="h-full flex items-center justify-center animate-pulse">
      <div className="w-28 h-28 rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
    </div>
  );
}

export function SpendingChartWidget({ instanceId: _ }: WidgetProps) {
  const scale = useWidgetScale();
  const currency = usePrimaryCurrency();
  const period = new Date().toISOString().slice(0, 7);
  const sym = CURRENCY_SYM[currency] ?? currency;

  const { data, isLoading } = useQuery<CategoryItem[]>({
    queryKey: ["analytics-category-breakdown", period, currency],
    queryFn: () =>
      api.get<CategoryItem[]>(
        `/api/v2/analytics/category-breakdown?period=${period}&currency=${currency}&op_type=EXPENSE`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
          Нет расходов за этот месяц
        </p>
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
  const total = items.reduce((s, i) => s + i.amount, 0);

  const donutData = items.map((item) => ({ name: item.category_name, value: item.amount }));
  const sorted = [...donutData].sort((a, b) => b.value - a.value);

  return (
    <div className="h-full flex flex-col gap-2 p-4">
      <DonutChart
        data={donutData}
        caption="Итого"
        total={`${sym} ${fmt(total)}`}
        formatValue={(v) => `${sym} ${fmt(v)}`}
        height={Math.round(140 * scale)}
        scale={scale}
      />

      <div className="flex flex-col gap-1 shrink-0">
        {sorted.slice(0, 5).map((item, i) => (
          <div key={item.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seriesColor(i) }} />
            <span className="flex-1 text-[11px] truncate" style={{ color: "var(--t-secondary)" }}>
              {item.name}
            </span>
            <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>
              {Math.round((item.value / total) * 100)}%
            </span>
          </div>
        ))}
        {sorted.length > 5 && (
          <p className="text-[10px]" style={{ color: "var(--t-faint)" }}>
            +{sorted.length - 5} категорий
          </p>
        )}
      </div>
    </div>
  );
}
