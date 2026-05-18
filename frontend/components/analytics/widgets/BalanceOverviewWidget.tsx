"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { CURRENCY_SYM } from "../usePrimaryCurrency";
import { StatBlock } from "@/components/primitives/StatBlock";
import type { WidgetProps } from "../types";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-3 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="h-3 w-12 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-6 w-16 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BalanceOverviewWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <Skeleton />;

  const entries = Object.entries(data.financial_summary);
  if (entries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-[13px]" style={{ color: "var(--t-faint)" }}>
          Нет данных за этот месяц
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col justify-center gap-4">
      {entries.map(([currency, block]) => {
        const sym = CURRENCY_SYM[currency] ?? currency;
        const isPositive = block.difference >= 0;

        return (
          <div key={currency}>
            {entries.length > 1 && (
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                style={{ color: "var(--t-faint)" }}
              >
                {currency}
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              <StatBlock size="compact" label="Доходы" tone="success" value={`+${sym} ${fmt(block.income)}`} />
              <StatBlock size="compact" label="Расходы" tone="danger"  value={`−${sym} ${fmt(block.expense)}`} />
              <StatBlock
                size="compact"
                label="Итого"
                tone={isPositive ? "success" : "danger"}
                value={`${isPositive ? "+" : "−"}${sym} ${fmt(block.difference)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
