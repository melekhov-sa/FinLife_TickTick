"use client";

/**
 * Капитал (net worth) — динамика по месяцам.
 * Три линии: деньги (обычные + накопления), долг по кредитам (по модулю),
 * капитал = деньги − долг. Видно, как кредиты гасятся, деньги растут.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Skeleton } from "@/components/primitives/Skeleton";

interface NetWorthMonth {
  month: string;
  money: number;
  debt: number;
  lent?: number;      // мне должны (личные долги)
  borrowed?: number;  // я должен
  capital: number;
}

interface NetWorthReport {
  months: NetWorthMonth[];
  current: { money: number; debt: number; lent?: number; borrowed?: number; capital: number } | null;
}

const RANGES = [
  { id: "1",  label: "1 мес" },
  { id: "3",  label: "3 мес" },
  { id: "6",  label: "6 мес" },
  { id: "12", label: "12 мес" },
  { id: "24", label: "24 мес" },
  { id: "36", label: "36 мес" },
];

function fmt(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export default function NetWorthPage() {
  const [range, setRange] = useState("24");

  const { data, isLoading } = useQuery<NetWorthReport>({
    queryKey: ["net-worth", range],
    queryFn: () => api.get<NetWorthReport>(`/api/v2/analytics/net-worth?months=${range}`),
    staleTime: 60_000,
  });

  const points = (data?.months ?? []).map((m) => {
    const monthName = MONTH_SHORT[Number(m.month.slice(5, 7)) - 1];
    const label =
      m.month.length === 10
        ? `${Number(m.month.slice(8, 10))} ${monthName}` // дневная точка: «5 июл»
        : `${monthName}${m.month.slice(2, 4) !== String(new Date().getFullYear()).slice(2) ? " " + m.month.slice(2, 4) : ""}`;
    return { ...m, label };
  });

  // Дельта капитала за окно
  const first = points.find((p) => p.capital !== 0) ?? points[0];
  const last = points[points.length - 1];
  const capitalDelta = first && last ? last.capital - first.capital : 0;

  return (
    <>
      <PageHeader
        title="Капитал"
        subtitle="Деньги, кредиты и итоговый капитал по месяцам"
        density="compact"
        tabs={
          <Tabs
            items={RANGES}
            active={range}
            onChange={setRange}
            variant="pills"
          />
        }
      />
      <main className="flex-1 p-4 md:p-6 max-w-4xl space-y-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton variant="rect" className="h-20 rounded-xl" />
            <Skeleton variant="rect" className="h-64 rounded-xl" />
          </div>
        )}

        {data && !data.current && (
          <p className="text-[13px] py-10 text-center" style={{ color: "var(--t-faint)" }}>
            Нет кошельков в RUB
          </p>
        )}

        {data?.current && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi
                label="Капитал"
                value={`${fmt(data.current.capital)} ₽`}
                icon={<Landmark size={13} />}
                accent="var(--app-accent)"
              />
              <Kpi
                label="Деньги"
                value={`${fmt(data.current.money)} ₽`}
                icon={<TrendingUp size={13} />}
                accent="var(--c-success-ink)"
              />
              <Kpi
                label="Долг по кредитам"
                value={`${fmt(data.current.debt)} ₽`}
                icon={<TrendingDown size={13} />}
                accent="var(--c-danger-ink)"
              />
              <Kpi
                label={`Рост за ${range} мес`}
                value={`${capitalDelta >= 0 ? "+" : ""}${fmt(capitalDelta)} ₽`}
                accent={capitalDelta >= 0 ? "var(--c-success-ink)" : "var(--c-danger-ink)"}
              />
              {(data.current.lent ?? 0) > 0 && (
                <Kpi
                  label="Мне должны"
                  value={`${fmt(data.current.lent ?? 0)} ₽`}
                  accent="var(--c-success-ink)"
                />
              )}
              {(data.current.borrowed ?? 0) > 0 && (
                <Kpi
                  label="Я должен"
                  value={`${fmt(data.current.borrowed ?? 0)} ₽`}
                  accent="var(--c-danger-ink)"
                />
              )}
            </div>

            {/* График */}
            <div
              className="rounded-2xl border p-4"
              style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "var(--t-faint)" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "var(--t-faint)" }}
                      tickFormatter={fmtShort}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        `${fmt(Number(value ?? 0))} ₽`,
                        String(name ?? ""),
                      ]}
                      contentStyle={{
                        background: "var(--app-card-bg)",
                        border: "1px solid var(--app-border)",
                        borderRadius: 12,
                        fontSize: 12,
                        color: "var(--t-primary)",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      iconType="plainline"
                    />
                    <Line
                      type="monotone"
                      dataKey="capital"
                      name="Капитал"
                      stroke="var(--app-accent)"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="money"
                      name="Деньги"
                      stroke="#10b981"
                      strokeWidth={1.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="debt"
                      name="Долг"
                      stroke="#ef4444"
                      strokeWidth={1.8}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
              Деньги — обычные и накопительные кошельки (RUB), долг — кредитные
              кошельки по модулю. Капитал = деньги − кредиты + мне должны − я должен
              (личные долги из раздела «Долги»). Балансы на конец месяца
              восстановлены из истории операций.
            </p>
          </>
        )}
      </main>
    </>
  );
}

function Kpi({
  label, value, icon, accent,
}: {
  label: string; value: string; icon?: React.ReactNode; accent?: string;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <p className="text-[10px] uppercase tracking-wide mb-1 flex items-center gap-1" style={{ color: "var(--t-faint)" }}>
        {icon}
        {label}
      </p>
      <p className="text-[16px] font-bold tabular-nums font-display" style={{ color: accent ?? "var(--t-primary)" }}>
        {value}
      </p>
    </div>
  );
}
