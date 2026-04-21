"use client";

import { useState } from "react";
import { ChevronDown, TrendingUp, TrendingDown } from "lucide-react";
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
  const debtLoadPct = finState.debt_load_pct ?? 0;
  const isHighDebt = debtLoadPct > 50;

  return (
    <div className={clsx(
      "rounded-xl md:rounded-[14px] border-[1.5px] p-3.5 md:p-5 transition-colors",
      "bg-white dark:bg-white/[0.03]",
      isHighDebt
        ? "border-red-200 dark:border-red-500/[0.2] bg-gradient-to-br from-white to-red-50/30 dark:from-white/[0.03] dark:to-red-950/10"
        : "border-slate-200 dark:border-white/[0.09]"
    )}>
      <div className="flex items-center justify-between mb-4 md:mb-5">
        <h2 className="text-sm md:text-[14px] font-semibold text-slate-900 dark:text-white">Финансы</h2>
        <button 
          onClick={() => setCollapsed((v) => !v)}
          className="text-slate-400 hover:text-slate-600 dark:text-white/50 dark:hover:text-white/70 transition-colors"
        >
          <ChevronDown size={16} className={clsx("transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-4 md:space-y-5">
          {/* Savings Hero Section */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 rounded-lg p-4 md:p-5 border border-blue-200 dark:border-blue-800/40">
            <div className="text-xs md:text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-2">Накопления</div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                {fmt(finState.savings_total)} ₽
              </div>
              {delta !== null && (
                <div className={clsx(
                  "flex items-center gap-1 px-2 py-1 rounded-md text-xs md:text-sm font-semibold",
                  delta >= 0
                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                )}>
                  {delta >= 0 ? (
                    <TrendingUp size={14} className="md:size-16" />
                  ) : (
                    <TrendingDown size={14} className="md:size-16" />
                  )}
                  <span>{delta >= 0 ? "+" : ""}{fmt(delta)} ₽</span>
                </div>
              )}
            </div>
          </div>

          {/* Regular Wallets & Credits */}
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-lg p-3 md:p-4 border border-slate-100 dark:border-white/[0.06]">
              <div className="text-xs md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Обычные кошельки</div>
              <div className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{fmt(finState.regular_total)} ₽</div>
            </div>
            <div className="bg-slate-50 dark:bg-white/[0.04] rounded-lg p-3 md:p-4 border border-slate-100 dark:border-white/[0.06]">
              <div className="text-xs md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Кредиты</div>
              <div className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{fmt(finState.credit_total)} ₽</div>
            </div>
          </div>

          {/* Financial Result */}
          <div className="bg-slate-50 dark:bg-white/[0.04] rounded-lg p-3 md:p-4 border border-slate-100 dark:border-white/[0.06]">
            <div className="text-xs md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5">Фин. результат</div>
            <div className={clsx(
              "text-lg md:text-xl font-bold",
              resultPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}>
              {resultPositive ? "" : "−"}{fmt(Math.abs(result))} ₽
            </div>
          </div>

          {/* Debt Load Progress Bar */}
          {finState.debt_load_pct !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs md:text-[12px] font-medium text-slate-600 dark:text-slate-400">Долговая нагрузка</span>
                <span className={clsx(
                  "text-xs md:text-sm font-bold",
                  isHighDebt ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"
                )}>
                  {finState.debt_load_pct}%
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-white/[0.1] rounded-full h-2 md:h-2.5 overflow-hidden">
                <div
                  className={clsx(
                    "h-full transition-all rounded-full",
                    isHighDebt
                      ? "bg-gradient-to-r from-red-500 to-red-600 dark:from-red-500 dark:to-red-600 shadow-lg shadow-red-500/30"
                      : "bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-500 dark:to-blue-600"
                  )}
                  style={{ width: `${Math.min(finState.debt_load_pct, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer Links */}
          <div className="flex gap-4 pt-2 md:pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <a
              href="/wallets"
              className="text-xs md:text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Кошельки →
            </a>
            <a
              href="/budget"
              className="text-xs md:text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              Бюджет →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
