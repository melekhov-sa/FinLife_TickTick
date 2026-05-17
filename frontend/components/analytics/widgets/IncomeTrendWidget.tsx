"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
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
        <div
          key={i}
          className="flex-1 rounded-t"
          style={{ height: `${h}%`, background: "var(--c-neutral-bg)" }}
        />
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
      api.get<MonthPoint[]>(
        `/api/v2/analytics/monthly-trend?months=6&currency=${currency}`,
      ),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;

  const points = (data ?? []).map((p) => ({
    ...p,
    label: MONTH_SHORT[p.month.slice(5, 7)] ?? p.month.slice(5, 7),
  }));

  const hasData = points.some((p) => p.income > 0 || p.expense > 0);

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
    n >= 1000
      ? `${sym}${(n / 1000).toFixed(1)}к`
      : `${sym}${Math.round(n)}`;

  return (
    <div className="h-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={points}
          margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
          barGap={2}
          barCategoryGap="28%"
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--app-border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--t-muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--t-faint)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmt}
            width={48}
          />
          <Tooltip
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any, name: any) => [
              typeof value === "number" ? `${sym} ${value.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}` : "",
              name === "income" ? "Доходы" : "Расходы",
            ]}
            contentStyle={{
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
              borderRadius: 10,
              fontSize: 12,
              color: "var(--t-primary)",
            }}
            cursor={{ fill: "var(--c-neutral-bg)", radius: 4 }}
          />
          <Legend
            formatter={(value) => (value === "income" ? "Доходы" : "Расходы")}
            wrapperStyle={{ fontSize: 11, color: "var(--t-muted)" }}
          />
          <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
          <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
