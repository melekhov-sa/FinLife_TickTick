"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart } from "@/components/primitives/charts";
import { usePrimaryCurrency } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface WeekdayItem { day: string; avg: number; total: number; count: number; }
interface WeekdayResponse { weekdays: WeekdayItem[]; }

const CURRENCY_SYM: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };

function fmt(n: number) {
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-2 animate-pulse">
      <div className="h-3 w-32 rounded" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex-1 flex items-end gap-1 pb-4">
        {[5, 8, 3, 9, 7, 4, 2].map((h, i) => (
          <div key={i} className="flex-1 rounded-t" style={{ height: `${h * 9}%`, background: "var(--c-neutral-bg)" }} />
        ))}
      </div>
    </div>
  );
}

export function SpendingByWeekdayWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;

  const { data, isLoading } = useQuery<WeekdayResponse>({
    queryKey: ["analytics-spending-weekday", currency],
    queryFn: () => api.get<WeekdayResponse>(`/api/v2/analytics/spending-by-weekday?currency=${currency}`),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  const { weekdays } = data;
  if (!weekdays.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет данных</p>
      </div>
    );
  }

  const barData = weekdays.map((d) => ({ label: d.day, value: d.avg }));

  return (
    <div className="h-full flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between shrink-0 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
          среднее
        </span>
      </div>
      <BarChart
        data={barData}
        height={160}
        highlightPeak
        formatValue={(v) => `${sym}${fmt(v)}`}
        peakCaption={(d) => `Пик: ${d.label} · ${sym}${fmt(d.value)}`}
        showYAxis
      />
    </div>
  );
}
