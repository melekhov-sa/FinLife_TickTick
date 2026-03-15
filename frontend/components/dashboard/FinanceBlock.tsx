"use client";

import { clsx } from "clsx";
import type { FinStateBlock, FinancialCurrencyBlock } from "@/types/api";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

interface Props {
  finState: FinStateBlock;
  financialSummary: Record<string, FinancialCurrencyBlock>;
}

export function FinanceBlock({ finState, financialSummary }: Props) {
  const result = finState.financial_result;
  const resultPositive = result >= 0;
  const delta = finState.capital_delta_30;

  const rows = [
    { label: "Обычные кошельки", value: finState.regular_total, color: null },
    { label: "Кредиты",          value: finState.credit_total,  color: "text-red-400" },
    { label: "Накопления",       value: finState.savings_total, color: "text-emerald-400" },
  ];

  const rub = financialSummary?.["RUB"];

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4 space-y-3">
      <h2 className="text-[11px] font-semibold text-white/68 uppercase tracking-widest">
        Финансовое состояние
      </h2>

      {/* Wallet rows */}
      <div className="space-y-1.5">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] text-white/55 truncate">{label}</span>
            <span className={clsx("text-[12.5px] font-medium tabular-nums shrink-0", color ?? "text-white/75")}>
              {fmt(value)} руб.
            </span>
          </div>
        ))}
      </div>

      {/* Financial result */}
      <div className="border-t border-white/[0.06] pt-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-white/55">Финансовый результат</span>
        <span className={clsx(
          "text-[13px] font-semibold tabular-nums shrink-0",
          resultPositive ? "text-white/80" : "text-red-400"
        )}>
          {resultPositive ? "" : "-"}{fmt(Math.abs(result))} руб.
        </span>
      </div>

      {/* Meta */}
      <div className="space-y-1">
        {rub && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-white/60">Доходная нагрузка</span>
            <span className="text-[11px] text-white/72 tabular-nums">
              {rub.income > 0 ? Math.round((rub.expense / rub.income) * 100) : 0}%
            </span>
          </div>
        )}
        {delta !== null && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-white/60">Капитал за 30 дн.</span>
            <span className={clsx(
              "text-[11px] tabular-nums font-medium",
              delta >= 0 ? "text-emerald-400/70" : "text-red-400/70"
            )}>
              {delta >= 0 ? "+" : ""}{fmt(delta)} ₽
            </span>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="border-t border-white/[0.05] pt-2 flex gap-4">
        <a href="/legacy/wallets" className="text-[11px] font-medium text-white/58 hover:text-indigo-400 transition-colors">
          Кошельки →
        </a>
        <a href="/legacy/budget" className="text-[11px] font-medium text-white/58 hover:text-indigo-400 transition-colors">
          Бюджет →
        </a>
      </div>
    </div>
  );
}
