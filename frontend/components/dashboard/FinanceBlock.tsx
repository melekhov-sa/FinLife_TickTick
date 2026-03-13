"use client";

import { clsx } from "clsx";
import type { FinStateBlock, FinancialCurrencyBlock } from "@/types/api";

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0,
  }).format(n);
}

interface Props {
  finState: FinStateBlock;
  financialSummary: Record<string, FinancialCurrencyBlock>;
}

export function FinanceBlock({ finState, financialSummary }: Props) {
  const delta = finState.capital_delta_30;
  const deltaPositive = delta !== null && delta >= 0;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5 space-y-5">
      <h2 className="text-sm font-medium text-white/60">Finance</h2>

      {/* Net worth */}
      <div>
        <p className="text-xs text-white/30 mb-1">Net worth</p>
        <p className="text-2xl font-light text-white/85 tabular-nums">
          {fmt(finState.financial_result)}{" "}
          <span className="text-base text-white/30">₽</span>
        </p>
        {delta !== null && (
          <p
            className={clsx(
              "text-xs mt-1",
              deltaPositive ? "text-emerald-400/70" : "text-red-400/70"
            )}
          >
            {deltaPositive ? "+" : ""}
            {fmt(delta)} за 30 дн.
          </p>
        )}
      </div>

      {/* Wallet split */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[10px] text-white/25 mb-1">Cash</p>
          <p className="text-sm font-medium text-white/70 tabular-nums">{fmt(finState.regular_total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/25 mb-1">Savings</p>
          <p className="text-sm font-medium text-white/70 tabular-nums">{fmt(finState.savings_total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/25 mb-1">Credit</p>
          <p className="text-sm font-medium text-red-400/70 tabular-nums">{fmt(finState.credit_total)}</p>
        </div>
      </div>

      {/* Monthly summary */}
      {Object.entries(financialSummary).map(([cur, block]) => (
        <div key={cur} className="border-t border-white/[0.06] pt-4">
          <p className="text-[10px] text-white/30 mb-2">This month · {cur}</p>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-400/70">+{fmt(block.income)}</span>
            <span className="text-red-400/70">−{fmt(block.expense)}</span>
            <span
              className={clsx(
                block.difference >= 0 ? "text-white/50" : "text-red-400/60"
              )}
            >
              {block.difference >= 0 ? "+" : ""}
              {fmt(block.difference)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
