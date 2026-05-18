"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePrimaryCurrency, CURRENCY_SYM } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

interface BudgetRow { category_id: number | null; title: string; depth: number; plan: number; fact: number; }
interface BudgetTotal { plan: number; fact: number; }
interface BudgetResponse {
  period_label: string;
  income_total: BudgetTotal;
  expense_total: BudgetTotal;
  income_rows: BudgetRow[];
  expense_rows: BudgetRow[];
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

function PlanFactRow({ label, plan, fact, sym, isIncome }: {
  label: string; plan: number; fact: number; sym: string; isIncome: boolean;
}) {
  const pct = plan > 0 ? Math.min((fact / plan) * 100, 100) : 0;
  const over = plan > 0 && fact > plan;
  const accentColor = isIncome
    ? (fact >= plan ? "var(--c-success-ink)" : "var(--app-accent)")
    : (over ? "var(--c-danger-ink)" : "var(--app-accent)");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium" style={{ color: "var(--t-secondary)" }}>{label}</span>
        <div className="flex items-baseline gap-1 shrink-0">
          <span className="text-[13px] font-bold tabular-nums" style={{ color: over && !isIncome ? "var(--c-danger-ink)" : "var(--t-primary)" }}>
            {sym}{fmt(fact)}
          </span>
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>/ {sym}{fmt(plan)}</span>
        </div>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-neutral-bg)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accentColor }} />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col justify-center gap-3 animate-pulse">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="flex justify-between">
            <div className="h-3 w-16 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-3 w-20 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
          <div className="h-1.5 w-full rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}

export function BudgetOverviewWidget({ instanceId: _ }: WidgetProps) {
  const currency = usePrimaryCurrency();
  const sym = CURRENCY_SYM[currency] ?? currency;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const { data, isLoading, isError } = useQuery<BudgetResponse>({
    queryKey: ["analytics-budget", year, month],
    queryFn: () => api.get<BudgetResponse>(`/api/v2/budget?year=${year}&month=${month}`),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

  const { period_label, income_total, expense_total } = data;
  const net = income_total.fact - expense_total.fact;

  return (
    <div className="h-full flex flex-col justify-center gap-3">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-[11px] font-semibold" style={{ color: "var(--t-faint)" }}>{period_label}</span>
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{ color: net >= 0 ? "var(--c-success-ink)" : "var(--c-danger-ink)" }}
        >
          {net >= 0 ? "+" : ""}{sym}{fmt(net)}
        </span>
      </div>

      <PlanFactRow label="Доходы" plan={income_total.plan} fact={income_total.fact} sym={sym} isIncome />
      <PlanFactRow label="Расходы" plan={expense_total.plan} fact={expense_total.fact} sym={sym} isIncome={false} />
    </div>
  );
}
