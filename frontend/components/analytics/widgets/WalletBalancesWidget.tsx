"use client";

import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { api } from "@/lib/api";
import { StatBlock } from "@/components/primitives/StatBlock";
import {
  CHART_AXIS,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_PAIR,
} from "@/components/primitives/charts";
import { usePrimaryCurrency } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface WalletItem { title: string; balance: number; }
interface TrendPoint { month: string; balance: number; }
interface WalletBalancesResponse { wallets: WalletItem[]; total: number; balance_trend: TrendPoint[]; }

const CURRENCY_SYM: Record<string, string> = { UAH: "₴", RUB: "₽", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-2 animate-pulse">
      <div className="h-8 w-28 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex-1 rounded-xl" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="flex flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-20 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-3 w-14 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WalletBalancesWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;

  const { data, isLoading } = useQuery<WalletBalancesResponse>({
    queryKey: ["analytics-wallet-balances", currency],
    queryFn: () => api.get<WalletBalancesResponse>(`/api/v2/analytics/wallet-balances?currency=${currency}`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  const { wallets, total, balance_trend } = data;
  const points = balance_trend.slice(-6).map((p) => ({
    ...p,
    label: p.month.slice(5),
  }));

  const first = points[0]?.balance ?? 0;
  const last = points[points.length - 1]?.balance ?? total;
  const delta = last - first;
  const deltaLabel = points.length >= 2
    ? `${delta >= 0 ? "+" : ""}${sym}${fmt(delta)}`
    : null;

  return (
    <div className="h-full flex flex-col gap-2 p-4">
      {/* Total */}
      <div className="shrink-0">
        <StatBlock
          size="hero"
          value={`${sym}${fmt(total)}`}
          sub="суммарный баланс · 6 мес."
          delta={deltaLabel ? { label: deltaLabel } : undefined}
        />
      </div>

      {/* Trend chart */}
      {points.length >= 2 && (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ ...CHART_AXIS, fontSize: 9 }}
                axisLine={false} tickLine={false} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => [typeof v === "number" ? `${sym}${fmt(v)}` : "", "Баланс"]}
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              />
              <Line
                type="monotone" dataKey="balance" stroke={CHART_PAIR.accent}
                strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: CHART_PAIR.accent }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Wallet list */}
      <div className="shrink-0 flex flex-col gap-0.5">
        {wallets.slice(0, 4).map((w, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-[11px] truncate" style={{ color: "var(--t-secondary)" }}>{w.title}</span>
            <span className="text-[11px] tabular-nums shrink-0 font-medium" style={{ color: "var(--t-primary)" }}>
              {sym}{fmt(w.balance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
