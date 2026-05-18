"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DualBarChart, CHART_PAIR } from "@/components/primitives/charts";
import { usePrimaryCurrency } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface MonthPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  net: number;
}

const MONTH_SHORT: Record<string, string> = {
  "01": "Янв", "02": "Фев", "03": "Мар", "04": "Апр",
  "05": "Май", "06": "Июн", "07": "Июл", "08": "Авг",
  "09": "Сен", "10": "Окт", "11": "Ноя", "12": "Дек",
};

const CURRENCY_SYM: Record<string, string> = {
  UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł",
};

function Skeleton() {
  return (
    <div className="h-full flex items-end gap-1 pb-2 animate-pulse">
      {[60, 80, 45, 90, 70, 55].map((h, i) => (
        <div key={i} className="flex-1 rounded-t"
          style={{ height: `${h}%`, background: "var(--c-neutral-bg)" }} />
      ))}
    </div>
  );
}

export function IncomeTrendWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;

  const { data, isLoading } = useQuery<MonthPoint[]>({
    queryKey: ["analytics-monthly-trend", currency],
    queryFn: () =>
      api.get<MonthPoint[]>(`/api/v2/analytics/monthly-trend?months=6&currency=${currency}`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;

  const points = (data ?? []).map((p) => ({
    label: MONTH_SHORT[p.month.slice(5, 7)] ?? p.month.slice(5, 7),
    a: p.income,
    b: p.expense,
  }));

  const hasData = points.some((p) => p.a > 0 || p.b > 0);
  if (!hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
          Нет данных за последние 6 месяцев
        </p>
      </div>
    );
  }

  const fmt = (n: number) =>
    n >= 1000 ? `${sym}${(n / 1000).toFixed(1)}к` : `${sym}${Math.round(n)}`;

  return (
    <div className="h-full flex flex-col gap-2 p-4">
      {/* Legend */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--t-secondary)" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: CHART_PAIR.income }} />
          Доходы
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--t-secondary)" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: CHART_PAIR.expense }} />
          Расходы
        </span>
      </div>

      <div className="flex-1 min-h-0">
        <DualBarChart
          data={points}
          height={200}
          labelA="Доходы"
          labelB="Расходы"
          formatValue={fmt}
        />
      </div>
    </div>
  );
}
