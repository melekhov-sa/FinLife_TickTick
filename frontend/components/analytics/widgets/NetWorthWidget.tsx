"use client";

import { useDashboard } from "@/hooks/useDashboard";
import type { WidgetProps } from "../types";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("uk-UA", { maximumFractionDigits: 0 });
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
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) return <Skeleton />;

  const { regular_total, savings_total, credit_total, capital_delta_30 } =
    data.fin_state;
  const total = regular_total + savings_total;
  const isNeg = total < 0;

  return (
    <div className="h-full flex flex-col justify-center gap-1">
      <span
        className="text-[26px] font-bold tabular-nums leading-none"
        style={{
          color: isNeg ? "var(--c-danger-ink)" : "var(--t-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {isNeg ? "-" : ""}₴&nbsp;{fmt(total)}
      </span>

      <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
        регулярные + накопления
      </span>

      {credit_total !== 0 && (
        <span
          className="text-[11px] tabular-nums"
          style={{ color: credit_total < 0 ? "var(--c-danger-ink)" : "var(--t-muted)" }}
        >
          кредит: {credit_total < 0 ? "-" : "+"}₴&nbsp;{fmt(credit_total)}
        </span>
      )}

      {capital_delta_30 !== null && capital_delta_30 !== 0 && (
        <span
          className="mt-1 text-[11px] font-medium tabular-nums"
          style={{
            color:
              capital_delta_30 >= 0
                ? "var(--c-success-ink)"
                : "var(--c-danger-ink)",
          }}
        >
          {capital_delta_30 >= 0 ? "+" : "-"}₴&nbsp;{fmt(capital_delta_30)}{" "}
          <span style={{ color: "var(--t-faint)", fontWeight: 400 }}>за 30 дней</span>
        </span>
      )}
    </div>
  );
}
