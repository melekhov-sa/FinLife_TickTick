"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { usePrimaryCurrency, CURRENCY_SYM } from "../usePrimaryCurrency";
import { StatBlock } from "@/components/primitives/StatBlock";
import type { WidgetProps } from "../types";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-2 animate-pulse">
      <div className="h-8 w-28 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      <div className="h-3 w-20 rounded" style={{ background: "var(--c-neutral-bg)" }} />
    </div>
  );
}

export function NetWorthWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading, isError } = useDashboard();
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const { regular_total, savings_total, credit_total, capital_delta_30 } = data.fin_state;
  const total = regular_total + savings_total;
  const isNeg = total < 0;

  const deltaLabel = capital_delta_30 != null && capital_delta_30 !== 0
    ? `${capital_delta_30 >= 0 ? "+" : "−"}${sym} ${fmt(capital_delta_30)}`
    : null;

  return (
    <div className="h-full flex flex-col justify-center gap-2">
      <StatBlock
        size="hero"
        tone={isNeg ? "danger" : "neutral"}
        value={`${isNeg ? "−" : ""}${sym} ${fmt(total)}`}
        sub="регулярные + накопления"
        delta={deltaLabel ? { label: deltaLabel, hint: "за 30 дней" } : undefined}
      />
      {credit_total !== 0 && (
        <span
          className="text-[11px] tabular-nums"
          style={{ color: credit_total < 0 ? "var(--c-danger-ink)" : "var(--t-muted)" }}
        >
          {"кредит:"} {credit_total < 0 ? "−" : "+"}{sym}&nbsp;{fmt(credit_total)}
        </span>
      )}
    </div>
  );
}
