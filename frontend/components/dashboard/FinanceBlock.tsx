"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FinStateBlock, FinancialCurrencyBlock } from "@/types/api";
import { CountUp } from "@/components/primitives/CountUp";

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
  const rub = financialSummary?.["RUB"];

  // Личные долги: показываем строки только при ненулевых остатках
  const { data: debtsData } = useQuery<{ totals: Record<string, { lent: number; borrowed: number }> }>({
    queryKey: ["debts", "OPEN"],
    queryFn: () => api.get("/api/v2/debts?status=OPEN"),
    staleTime: 60_000,
  });
  const debtLent = debtsData?.totals?.["RUB"]?.lent ?? 0;
  const debtBorrowed = debtsData?.totals?.["RUB"]?.borrowed ?? 0;

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-xl md:rounded-[14px] border border-slate-200 dark:border-white/[0.09] shadow-sm p-3.5 md:p-5">
      <h2 className="text-[13px] md:text-[14px] font-semibold mb-2 md:mb-3" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Финансы
      </h2>

      {/* Wallet rows */}
      <div className="space-y-1.5 md:space-y-2">
            {/* Regular */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Обычные кошельки</span>
              <span className="text-[13px] md:text-[14px] font-semibold tabular-nums" style={{ color: "var(--t-secondary)" }}>
                <CountUp value={finState.regular_total} /> ₽
              </span>
            </div>

            {/* Credit */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Кредиты</span>
              <span className="text-[13px] md:text-[14px] font-semibold tabular-nums money-expense">
                <CountUp value={finState.credit_total} /> ₽
              </span>
            </div>

            {/* Личные долги — только ненулевые */}
            {debtLent > 0 && (
              <Link href="/debts" className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Мне должны</span>
                <span className="text-[13px] md:text-[14px] font-semibold tabular-nums money-income">
                  <CountUp value={debtLent} /> ₽
                </span>
              </Link>
            )}
            {debtBorrowed > 0 && (
              <Link href="/debts" className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Я должен</span>
                <span className="text-[13px] md:text-[14px] font-semibold tabular-nums money-expense">
                  <CountUp value={debtBorrowed} /> ₽
                </span>
              </Link>
            )}

            {/* Savings — with delta inline */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Накопления</span>
              <div className="text-right">
                <p className="text-[13px] md:text-[14px] font-semibold tabular-nums money-income leading-snug">
                  <CountUp value={finState.savings_total} /> ₽
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

            {/* Collection cost basis — only when the collection has items */}
            {finState.collection_cost > 0 && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] md:text-[13px] min-w-0 truncate" style={{ color: "var(--t-muted)" }}>Коллекция (себес.)</span>
                <span className="text-[13px] md:text-[14px] font-semibold tabular-nums whitespace-nowrap shrink-0" style={{ color: "var(--t-secondary)" }}>
                  {fmt(finState.collection_cost)} ₽
                </span>
              </div>
            )}
          </div>

          {/* Financial result */}
          <div className="border-t border-white/[0.06] mt-2.5 md:mt-3 pt-2.5 md:pt-3 flex items-baseline justify-between gap-2">
            <span className="text-[12px] md:text-[13px]" style={{ color: "var(--t-muted)" }}>Фин. результат</span>
            <span className={clsx("text-[13px] md:text-[14px] font-semibold tabular-nums", resultPositive ? "money-income" : "money-expense")}>
              {resultPositive ? "" : "\u2212"}{fmt(Math.abs(result))} ₽
            </span>
          </div>

          {/* Debt load */}
          {finState.debt_load_pct !== null && finState.debt_load_pct !== undefined && (
            <div className="mt-1.5">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className="text-[11px] md:text-[12px]" style={{ color: "var(--t-faint)" }}>Долговая нагрузка</span>
                <span className="text-[11px] md:text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-secondary)" }}>
                  {finState.debt_load_pct}%
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-white/[0.07]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, finState.debt_load_pct)}%`,
                    background:
                      finState.debt_load_pct >= 50 ? "#EF4444" :
                      finState.debt_load_pct >= 30 ? "#F59E0B" :
                      "#10B981",
                  }}
                />
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="border-t border-white/[0.05] mt-2.5 md:mt-3 pt-2 md:pt-2.5 flex gap-4">
            <a href="/wallets" className="text-[11px] md:text-[12px] font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
              Кошельки →
            </a>
            <a href="/budget" className="text-[11px] md:text-[12px] font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
              Бюджет →
            </a>
            <a
              href="/net-worth"
              className="ml-auto inline-flex items-center gap-1 text-[11px] md:text-[12px] font-semibold transition-opacity hover:opacity-80"
              style={{ color: "var(--app-accent)" }}
              title="График капитала"
            >
              <TrendingUp size={13} />
              Капитал
            </a>
      </div>
    </div>
  );
}
