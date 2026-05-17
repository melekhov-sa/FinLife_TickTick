"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "@/lib/api";
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

  const maxAvg = Math.max(...weekdays.map((d) => d.avg), 1);
  const peakIdx = weekdays.findIndex((d) => d.avg === maxAvg);

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-semibold" style={{ color: "var(--t-secondary)" }}>Траты по дням недели</span>
        <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>среднее</span>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekdays} margin={{ top: 4, right: 4, left: -28, bottom: 0 }} barCategoryGap="20%">
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--t-faint)" }}
              axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "var(--t-faint)" }}
              axisLine={false} tickLine={false} allowDecimals={false}
              tickFormatter={(v) => fmt(v)} />
            <Tooltip
              formatter={(v: number) => [`${sym}${fmt(v)}`, "Среднее"]}
              contentStyle={{
                background: "var(--app-card-bg)", border: "1px solid var(--app-border)",
                borderRadius: 10, fontSize: 12, color: "var(--t-primary)",
              }}
              cursor={{ fill: "var(--c-neutral-bg)", radius: 4 }}
            />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {weekdays.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === peakIdx ? "var(--c-danger-ink)" : "var(--app-accent)"}
                  fillOpacity={i === peakIdx ? 0.9 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="shrink-0 text-center">
        <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>
          Пик: <strong style={{ color: "var(--c-danger-ink)" }}>{weekdays[peakIdx]?.day}</strong> · {sym}{fmt(maxAvg)}
        </span>
      </div>
    </div>
  );
}
