"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { usePrimaryCurrency } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface CategoryItem {
  category_name: string;
  category_id: number | null;
  amount: number;
  percent: number;
}

const COLORS = [
  "#6366F1", "#8B5CF6", "#EC4899", "#F59E0B",
  "#10B981", "#3B82F6", "#F97316", "#14B8A6",
  "#EF4444", "#84CC16",
];

const CURRENCY_SYM: Record<string, string> = {
  UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł",
};

function Skeleton() {
  return (
    <div className="h-full flex items-center justify-center animate-pulse">
      <div
        className="w-28 h-28 rounded-full"
        style={{ background: "var(--c-neutral-bg)" }}
      />
    </div>
  );
}

export function SpendingChartWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
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

  const fmt = (n: number) =>
    n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              cx="50%"
              cy="50%"
              innerRadius="52%"
              outerRadius="78%"
              paddingAngle={2}
              dataKey="amount"
              nameKey="category_name"
            >
              {items.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `${sym} ${fmt(value)}`,
                "",
              ]}
              contentStyle={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--t-primary)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Total */}
      <p className="text-[11px] text-center shrink-0" style={{ color: "var(--t-muted)" }}>
        Итого: <span style={{ color: "var(--t-primary)", fontWeight: 600 }}>{sym} {fmt(total)}</span>
      </p>

      {/* Legend */}
      <div className="flex flex-col gap-1 shrink-0">
        {items.slice(0, 5).map((item, i) => (
          <div key={item.category_name} className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span
              className="flex-1 text-[11px] truncate"
              style={{ color: "var(--t-secondary)" }}
            >
              {item.category_name}
            </span>
            <span
              className="text-[11px] tabular-nums shrink-0"
              style={{ color: "var(--t-muted)" }}
            >
              {item.percent}%
            </span>
          </div>
        ))}
        {items.length > 5 && (
          <p className="text-[10px]" style={{ color: "var(--t-faint)" }}>
            +{items.length - 5} категорий
          </p>
        )}
      </div>
    </div>
  );
}
