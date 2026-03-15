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
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5 space-y-4">
      <h2 className="text-sm font-semibold text-white/85" style={{ letterSpacing: "-0.01em" }}>
        Финансы
      </h2>

      {/* Net worth */}
      <div>
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">
          Капитал
        </p>
        <p
          className="text-[28px] font-semibold text-white/90 tabular-nums leading-none"
          style={{ letterSpacing: "-0.03em" }}
        >
          {fmt(finState.financial_result)}
          <span className="text-lg text-white/35 ml-1 font-normal">₽</span>
        </p>
        {delta !== null && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className={clsx(
                "text-xs font-medium tabular-nums",
                deltaPositive ? "text-emerald-400" : "text-red-400"
              )}
            >
              {deltaPositive ? "▲ +" : "▼ "}{fmt(delta)} ₽
            </span>
            <span className="text-[10px] text-white/25">за 30 дн.</span>
          </div>
        )}
      </div>

      {/* Wallet split */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Наличные",   value: finState.regular_total,  color: "text-white/75" },
          { label: "Накопления", value: finState.savings_total,  color: "text-emerald-400/80" },
          { label: "Кредит",     value: finState.credit_total,   color: "text-red-400/70" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-white/[0.03] rounded-xl px-2.5 py-2.5 text-center border border-white/[0.05]"
          >
            <p className="text-[10px] text-white/25 mb-1 truncate">{label}</p>
            <p className={clsx("text-sm font-semibold tabular-nums", color)}>
              {fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Monthly summary */}
      {Object.entries(financialSummary)
        .filter(([, block]) => block.income !== 0 || block.expense !== 0)
        .map(([cur, block]) => (
          <div key={cur} className="border-t border-white/[0.05] pt-3">
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-widest mb-2">
              Этот месяц · {cur}
            </p>
            <div className="flex justify-between">
              <div>
                <p className="text-[10px] text-white/25 mb-0.5">Доходы</p>
                <p className="text-sm font-semibold tabular-nums text-emerald-400">+{fmt(block.income)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-white/25 mb-0.5">Расходы</p>
                <p className="text-sm font-semibold tabular-nums text-red-400">−{fmt(block.expense)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/25 mb-0.5">Итог</p>
                <p className={clsx(
                  "text-sm font-semibold tabular-nums",
                  block.difference >= 0 ? "text-white/65" : "text-red-400"
                )}>
                  {block.difference > 0 ? "+" : ""}{fmt(block.difference)}
                </p>
              </div>
            </div>
          </div>
        ))}

      {/* Quick links */}
      <div className="border-t border-white/[0.05] pt-3 flex gap-4">
        <a href="/legacy/wallets" className="text-xs font-medium text-white/30 hover:text-indigo-400 transition-colors">
          Кошельки →
        </a>
        <a href="/legacy/budget" className="text-xs font-medium text-white/30 hover:text-indigo-400 transition-colors">
          Бюджет →
        </a>
      </div>
    </div>
  );
}
