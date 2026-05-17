"use client";

import { useDashboard } from "@/hooks/useDashboard";
import type { WidgetProps } from "../types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  UAH: "₴",
  USD: "$",
  EUR: "€",
  GBP: "£",
  PLN: "zł",
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString("uk-UA", { maximumFractionDigits: 0 });
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
        const sym = CURRENCY_SYMBOLS[currency] ?? currency;
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
              {/* Доходы */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--t-muted)" }}>
                  Доходы
                </span>
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{ color: "var(--c-success-ink)" }}
                >
                  +{sym}&nbsp;{fmt(block.income)}
                </span>
              </div>

              {/* Расходы */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--t-muted)" }}>
                  Расходы
                </span>
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{ color: "var(--c-danger-ink)" }}
                >
                  -{sym}&nbsp;{fmt(block.expense)}
                </span>
              </div>

              {/* Разница */}
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px]" style={{ color: "var(--t-muted)" }}>
                  Итого
                </span>
                <span
                  className="text-[15px] font-semibold tabular-nums"
                  style={{
                    color: isPositive
                      ? "var(--c-success-ink)"
                      : "var(--c-danger-ink)",
                  }}
                >
                  {isPositive ? "+" : "-"}{sym}&nbsp;{fmt(block.difference)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
