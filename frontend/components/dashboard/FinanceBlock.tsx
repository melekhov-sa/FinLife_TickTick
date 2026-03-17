"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
  const [collapsed, setCollapsed] = useState(false);

  const result = finState.financial_result;
  const resultPositive = result >= 0;
  const delta = finState.capital_delta_30;
  const rub = financialSummary?.["RUB"];

  return (
    <div className="bg-white/[0.03] rounded-xl md:rounded-[14px] border border-white/[0.06] p-3.5 md:p-5">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          Финансы
        </h2>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <ChevronDown size={14} className={clsx("transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Wallet rows */}
          <div className="space-y-1.5 md:space-y-2">
            {/* Regular */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Обычные кошельки</span>
              <span className="text-[13px] md:text-[14px] font-semibold tabular-nums" style={{ color: "var(--t-secondary)" }}>
                {fmt(finState.regular_total)} ₽
              </span>
            </div>

            {/* Credit */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Кредиты</span>
              <span className="text-[13px] md:text-[14px] font-semibold tabular-nums money-expense">
                {fmt(finState.credit_total)} ₽
              </span>
            </div>

            {/* Savings — with delta inline */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Накопления</span>
              <div className="text-right">
                <p className="text-[13px] md:text-[14px] font-semibold tabular-nums money-income leading-snug">
                  {fmt(finState.savings_total)} ₽
                </p>
                {delta !== null && (
                  <p className={clsx(
                    "text-[11px] md:text-[12px] font-medium tabular-nums leading-snug",
                    delta >= 0 ? "text-emerald-400/70" : "text-red-400/70"
                  )}>
                    {delta >= 0 ? "+" : ""}{fmt(delta)} ₽
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Financial result */}
          <div className="border-t border-white/[0.06] mt-2.5 md:mt-3 pt-2.5 md:pt-3 flex items-baseline justify-between gap-2">
            <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Финансовый результат</span>
            <span className={clsx("text-[13px] md:text-[14px] font-semibold tabular-nums", resultPositive ? "money-income" : "money-expense")}>
              {resultPositive ? "" : "\u2212"}{fmt(Math.abs(result))} ₽
            </span>
          </div>

          {/* Income load */}
          {rub && rub.income > 0 && (
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <span className="text-[11px] md:text-[12px]" style={{ color: "var(--t-faint)" }}>Доходная нагрузка</span>
              <span className="text-[11px] md:text-[12px] tabular-nums" style={{ color: "var(--t-secondary)" }}>
                {Math.round((rub.expense / rub.income) * 100)}%
              </span>
            </div>
          )}

          {/* Quick links */}
          <div className="border-t border-white/[0.05] mt-2.5 md:mt-3 pt-2 md:pt-2.5 flex gap-4">
            <a href="/legacy/wallets" className="text-[11px] md:text-[12px] font-medium hover:text-indigo-400 transition-colors" style={{ color: "var(--t-muted)" }}>
              Кошельки →
            </a>
            <a href="/legacy/budget" className="text-[11px] md:text-[12px] font-medium hover:text-indigo-400 transition-colors" style={{ color: "var(--t-muted)" }}>
              Бюджет →
            </a>
          </div>
        </>
      )}
    </div>
  );
}
