"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/primitives/Skeleton";

interface BudgetRow {
  category_id: number | null;
  title: string;
  depth: number;
  parent_id: number | null;
  plan: number;
  fact: number;
}

interface BudgetData {
  year: number;
  month: number;
  period_label: string;
  income_total: { plan: number; fact: number };
  expense_total: { plan: number; fact: number };
  income_rows: BudgetRow[];
  expense_rows: BudgetRow[];
}

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function Bar({ plan, fact, kind }: { plan: number; fact: number; kind: "income" | "expense" }) {
  if (plan === 0 && fact === 0) return null;
  const max = Math.max(plan, fact, 1);
  const planPct = Math.min(100, (plan / max) * 100);
  const factPct = Math.min(100, (fact / max) * 100);
  const over = fact > plan && plan > 0;

  const planColor = kind === "income" ? "bg-emerald-500/30" : "bg-indigo-500/30";
  const factColor = kind === "income"
    ? "bg-emerald-500"
    : over ? "bg-red-500" : "bg-indigo-500";

  return (
    <div className="relative h-1 w-full bg-white/[0.05] rounded-full overflow-hidden mt-1">
      <div className={clsx("absolute left-0 top-0 h-full rounded-full", planColor)} style={{ width: `${planPct}%` }} />
      <div className={clsx("absolute left-0 top-0 h-full rounded-full transition-all", factColor)} style={{ width: `${factPct}%` }} />
    </div>
  );
}

function CategoryRow({ row, kind }: { row: BudgetRow; kind: "income" | "expense" }) {
  const diff = row.fact - row.plan;
  const hasPlan = row.plan > 0;
  const isOver = diff > 0 && kind === "expense" && hasPlan;
  const isUnder = diff < 0 && kind === "expense" && hasPlan;
  const isAbove = diff > 0 && kind === "income" && hasPlan;

  const diffColor = isOver ? "text-red-400" : (isUnder || isAbove) ? "text-emerald-400" : "text-white/30";

  return (
    <div className={clsx(
      "flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0",
      row.depth === 1 && "pl-4"
    )}>
      <div className="flex-1 min-w-0">
        <p className={clsx(
          "truncate",
          row.depth === 0 ? "text-[13px] font-semibold" : "text-[12px] font-normal"
        )} style={{ color: row.depth === 0 ? "var(--t-primary)" : "var(--t-secondary)" }}>
          {row.title}
        </p>
        <Bar plan={row.plan} fact={row.fact} kind={kind} />
      </div>

      <div className="text-right shrink-0 min-w-[80px]">
        <div className="flex items-baseline gap-1 justify-end">
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
            {fmt(row.fact)}
          </span>
          {hasPlan && (
            <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
              / {fmt(row.plan)}
            </span>
          )}
        </div>
        {hasPlan && diff !== 0 && (
          <p className={clsx("text-[11px] tabular-nums", diffColor)}>
            {diff > 0 ? "+" : ""}{fmt(diff)}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  rows,
  total,
  kind,
}: {
  label: string;
  rows: BudgetRow[];
  total: { plan: number; fact: number };
  kind: "income" | "expense";
}) {
  const diff = total.fact - total.plan;
  const hasPlan = total.plan > 0;
  const isEmpty = rows.length === 0 && total.fact === 0;
  const diffPositive = kind === "income" ? diff > 0 : diff < 0;

  if (isEmpty) return null;

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-[14px] p-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
          {label}
        </h2>
        <div className="text-right">
          <div className="flex items-baseline gap-1.5 justify-end">
            <span className={clsx(
              "text-[20px] font-bold tabular-nums leading-none",
              kind === "income" ? "text-emerald-400" : "text-red-400"
            )} style={{ letterSpacing: "-0.03em" }}>
              {fmt(total.fact)}
            </span>
            {hasPlan && (
              <span className="text-[13px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                / {fmt(total.plan)}
              </span>
            )}
          </div>
          {hasPlan && diff !== 0 && (
            <p className={clsx("text-[12px] font-medium tabular-nums", diffPositive ? "text-emerald-400" : "text-red-400")}>
              {diff > 0 ? "+" : ""}{fmt(diff)}
            </p>
          )}
        </div>
      </div>

      {/* Rows */}
      {rows.map((row, i) => (
        <CategoryRow key={row.category_id ?? `other-${i}`} row={row} kind={kind} />
      ))}
    </div>
  );
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export default function BudgetPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);


  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const { data, isPending, isError } = useQuery<BudgetData>({
    queryKey: ["budget", year, month],
    queryFn: () => api.get<BudgetData>(`/api/v2/budget?year=${year}&month=${month}`),
    staleTime: 60_000,
  });
  const isLoading = isPending;

  function goBack() {
    const p = prevMonth(year, month);
    setYear(p.year); setMonth(p.month);
  }
  function goForward() {
    const p = nextMonth(year, month);
    setYear(p.year); setMonth(p.month);
  }

  const balance = data ? data.income_total.fact - data.expense_total.fact : 0;
  const balancePlan = data ? data.income_total.plan - data.expense_total.plan : 0;

  return (
    <>

      <AppTopbar title="Бюджет" />

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">

        {/* Extended budget link */}
        <div className="mb-4">
          <Link
            href="/budget/matrix"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/[0.04]"
            style={{ borderColor: "rgba(255,255,255,0.07)", color: "var(--t-faint)" }}
          >
            Расширенный бюджет →
          </Link>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-secondary)" }}
          >
            <ChevronLeft size={18} />
          </button>

          <div className="text-center">
            <h1 className="text-[17px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--t-primary)" }}>
              {data?.period_label ?? `${month} / ${year}`}
            </h1>
            {isCurrentMonth && (
              <span className="text-[11px] font-medium text-indigo-400/60">текущий месяц</span>
            )}
          </div>

          <button
            onClick={goForward}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-secondary)" }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Balance summary */}
        {data && (
          <div className="rounded-[14px] bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] p-5 mb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>
                  Баланс
                </p>
                <p className={clsx(
                  "text-[28px] font-bold tabular-nums leading-none",
                  balance >= 0 ? "text-emerald-400" : "text-red-400"
                )} style={{ letterSpacing: "-0.04em" }}>
                  {balance >= 0 ? "+" : ""}{fmt(balance)} ₽
                </p>
                {balancePlan !== 0 && (
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                    план: {balancePlan >= 0 ? "+" : ""}{fmt(balancePlan)} ₽
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-right">
                <div>
                  <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Доходы</p>
                  <p className="text-[14px] font-semibold text-emerald-400 tabular-nums">{fmt(data.income_total.fact)} ₽</p>
                </div>
                <div>
                  <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Расходы</p>
                  <p className="text-[14px] font-semibold text-red-400 tabular-nums">{fmt(data.expense_total.fact)} ₽</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={192} className="rounded-[14px]" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить бюджет</p>
        )}

        {data && (
          <div className="space-y-4">
            <Section label="Доходы" rows={data.income_rows} total={data.income_total} kind="income" />
            <Section label="Расходы" rows={data.expense_rows} total={data.expense_total} kind="expense" />
          </div>
        )}

      </main>
    </>
  );
}
