"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm } from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import type { BudgetMatrix, BudgetCell, BudgetRow, BudgetGoalRow, BudgetSectionTotals } from "@/types/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n === 0) return "0";
  return Math.round(n).toLocaleString("ru-RU");
}

function fmtSigned(n: number): string {
  if (n === 0) return "0";
  const s = Math.round(n).toLocaleString("ru-RU");
  return n > 0 ? `+${s}` : s;
}

// ── Cell rendering ────────────────────────────────────────────────────────────

function PlanCell({ cell, isMuted }: { cell: BudgetCell; isMuted?: boolean }) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  if (!hasPlan && !hasFact) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--t-faint)", opacity: 0.4 }}>—</td>;
  }
  return (
    <td
      className="tabular-nums text-right px-2 py-1.5 text-[12px]"
      style={{ color: isMuted ? "var(--t-faint)" : "var(--t-secondary)" }}
    >
      {hasPlan ? fmt(cell.plan) : "—"}
    </td>
  );
}

function FactCell({
  cell,
  kind,
  isBold,
}: {
  cell: BudgetCell;
  kind: "income" | "expense" | "neutral";
  isBold?: boolean;
}) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;

  let color = "var(--t-secondary)";
  if (hasFact && hasPlan) {
    const isGood =
      (kind === "income" && cell.fact >= cell.plan) ||
      (kind === "expense" && cell.fact <= cell.plan);
    color = isGood ? "rgb(52 211 153)" : "rgb(248 113 113)";
  } else if (hasFact && !hasPlan) {
    color = "var(--t-secondary)";
  }

  if (!hasFact && !hasPlan) {
    return (
      <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--t-faint)", opacity: 0.4 }}>
        —
      </td>
    );
  }

  return (
    <td
      className={clsx("tabular-nums text-right px-2 py-1.5 text-[12px]", isBold && "font-semibold")}
      style={{ color: hasFact ? color : "var(--t-faint)" }}
    >
      {hasFact ? fmt(cell.fact) : "—"}
    </td>
  );
}

// ── Period pair headers ───────────────────────────────────────────────────────

function PeriodHeaders({ periods }: { periods: BudgetMatrix["periods"] }) {
  return (
    <>
      {periods.map((p) => (
        <th
          key={p.index}
          colSpan={2}
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-2 text-center border-b border-white/[0.06]"
          style={{ color: "var(--t-faint)" }}
        >
          {p.short_label}
        </th>
      ))}
      <th
        colSpan={2}
        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-2 text-center border-b border-white/[0.06]"
        style={{ color: "var(--t-faint)" }}
      >
        Итого
      </th>
    </>
  );
}

function SubHeaders({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count + 1 }).map((_, i) => (
        <>
          <th
            key={`p-${i}`}
            className="text-[9px] font-medium px-2 py-1 text-right border-b border-white/[0.06]"
            style={{ color: "var(--t-faint)", opacity: 0.7 }}
          >
            П
          </th>
          <th
            key={`f-${i}`}
            className="text-[9px] font-medium px-2 py-1 text-right border-b border-white/[0.06]"
            style={{ color: "var(--t-faint)", opacity: 0.7 }}
          >
            Ф
          </th>
        </>
      ))}
    </>
  );
}

// ── Section header row ────────────────────────────────────────────────────────

function SectionHeaderRow({
  label,
  colSpan,
  expanded,
  onToggle,
}: {
  label: string;
  colSpan: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      className="border-t border-white/[0.08] cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
      onClick={onToggle}
    >
      <td className="px-3 py-2" colSpan={1}>
        <div className="flex items-center gap-1.5">
          {expanded
            ? <ChevronDown size={11} style={{ color: "var(--t-faint)" }} />
            : <ChevronRightSm size={11} style={{ color: "var(--t-faint)" }} />
          }
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--t-muted)" }}
          >
            {label}
          </span>
        </div>
      </td>
      <td colSpan={colSpan - 1} />
    </tr>
  );
}

// ── Totals row ────────────────────────────────────────────────────────────────

function TotalsRow({
  label,
  totals,
  kind,
  periodCount,
}: {
  label: string;
  totals: BudgetSectionTotals;
  kind: "income" | "expense" | "neutral";
  periodCount: number;
}) {
  const labelColor =
    kind === "income" ? "rgb(52 211 153)" : kind === "expense" ? "rgb(248 113 113)" : "var(--t-primary)";

  return (
    <tr className="border-t border-white/[0.08] bg-white/[0.02]">
      <td
        className="text-[11px] font-bold px-3 py-2 sticky left-0 bg-[var(--app-sidebar-bg)] z-10"
        style={{ color: labelColor }}
      >
        {label}
      </td>
      {totals.cells.slice(0, periodCount).map((cell, i) => (
        <>
          <PlanCell key={`tp-${i}`} cell={cell} isMuted />
          <FactCell key={`tf-${i}`} cell={cell} kind={kind} isBold />
        </>
      ))}
      <PlanCell cell={totals.total} isMuted />
      <FactCell cell={totals.total} kind={kind} isBold />
    </tr>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryDataRow({
  row,
  periodCount,
}: {
  row: BudgetRow;
  periodCount: number;
}) {
  const kind: "income" | "expense" | "neutral" =
    row.kind === "INCOME" ? "income" : "expense";
  const indent = row.depth > 0 ? "pl-6" : "pl-3";

  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
      <td
        className={clsx(
          "text-[12px] py-1.5 sticky left-0 z-10 max-w-[180px] truncate",
          indent,
          row.is_group ? "font-semibold" : "font-normal"
        )}
        style={{
          color: row.is_group ? "var(--t-primary)" : "var(--t-secondary)",
          background: "var(--app-sidebar-bg)",
        }}
        title={row.title}
      >
        {row.title}
      </td>
      {row.cells.slice(0, periodCount).map((cell, i) => (
        <>
          <PlanCell key={`p-${i}`} cell={cell} />
          <FactCell key={`f-${i}`} cell={cell} kind={kind} />
        </>
      ))}
      <PlanCell cell={row.total} />
      <FactCell cell={row.total} kind={kind} />
    </tr>
  );
}

// ── Goal row ──────────────────────────────────────────────────────────────────

function GoalDataRow({
  row,
  periodCount,
  kind,
}: {
  row: BudgetGoalRow;
  periodCount: number;
  kind: "income" | "expense" | "neutral";
}) {
  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.015] transition-colors">
      <td
        className="text-[12px] py-1.5 px-3 sticky left-0 z-10 max-w-[180px] truncate font-normal"
        style={{ color: "var(--t-secondary)", background: "var(--app-sidebar-bg)" }}
        title={row.title}
      >
        {row.title}
      </td>
      {row.cells.slice(0, periodCount).map((cell, i) => (
        <>
          <PlanCell key={`p-${i}`} cell={cell} />
          <FactCell key={`f-${i}`} cell={cell} kind={kind} />
        </>
      ))}
      <PlanCell cell={row.total} />
      <FactCell cell={row.total} kind={kind} />
    </tr>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  result,
  periodCount,
}: {
  result: BudgetMatrix["result"];
  periodCount: number;
}) {
  return (
    <tr className="border-t-2 border-white/[0.12]">
      <td
        className="text-[11px] font-bold px-3 py-2.5 uppercase tracking-wider sticky left-0 z-10"
        style={{ color: "var(--t-primary)", background: "var(--app-sidebar-bg)" }}
      >
        Результат
      </td>
      {result.cells.slice(0, periodCount).map((cell, i) => {
        const planColor = cell.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
        const factColor = cell.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
        return (
          <>
            <td key={`rp-${i}`} className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold" style={{ color: planColor }}>
              {fmtSigned(cell.plan)}
            </td>
            <td key={`rf-${i}`} className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold" style={{ color: factColor }}>
              {fmtSigned(cell.fact)}
            </td>
          </>
        );
      })}
      <td
        className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold"
        style={{ color: result.total.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)" }}
      >
        {fmtSigned(result.total.plan)}
      </td>
      <td
        className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold"
        style={{ color: result.total.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)" }}
      >
        {fmtSigned(result.total.fact)}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BudgetMatrixPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rangeCount, setRangeCount] = useState(4);

  const [incomeOpen, setIncomeOpen] = useState(true);
  const [expenseOpen, setExpenseOpen] = useState(true);
  const [goalsOpen, setGoalsOpen] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(true);

  const { data, isPending, isError } = useQuery<BudgetMatrix>({
    queryKey: ["budget-matrix", year, month, rangeCount],
    queryFn: () =>
      api.get<BudgetMatrix>(
        `/api/v2/budget/matrix?year=${year}&month=${month}&range_count=${rangeCount}`
      ),
    staleTime: 30_000,
  });

  function goBack() {
    let m = month - rangeCount;
    let y = year;
    while (m < 1) { m += 12; y--; }
    setMonth(m); setYear(y);
  }
  function goForward() {
    let m = month + rangeCount;
    let y = year;
    while (m > 12) { m -= 12; y++; }
    setMonth(m); setYear(y);
  }

  const periods = data?.periods ?? [];
  const periodLabel = periods.length > 0
    ? `${periods[0].short_label} — ${periods[periods.length - 1].short_label}`
    : `${month}/${year}`;

  // Total columns = rangeCount periods * 2 (P+F) + 2 (total P+F)
  const dataCols = (rangeCount + 1) * 2;
  // Total colspan including category column
  const totalCols = dataCols + 1;

  return (
    <>
      <AppTopbar title="Бюджет (матрица)" />

      <main className="flex-1 overflow-hidden flex flex-col">

        {/* Controls bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0 flex-wrap gap-y-2"
          style={{ borderColor: "var(--app-border)" }}
        >
          {/* Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={goBack}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              style={{ color: "var(--t-secondary)" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span
              className="text-[13px] font-semibold tabular-nums min-w-[130px] text-center"
              style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}
            >
              {periodLabel}
            </span>
            <button
              onClick={goForward}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              style={{ color: "var(--t-secondary)" }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Period count selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>Периодов:</span>
            <div className="flex gap-px">
              {[1, 2, 3, 4, 6, 12].map((n) => (
                <button
                  key={n}
                  onClick={() => setRangeCount(n)}
                  className={clsx(
                    "w-7 h-6 text-[11px] font-medium rounded transition-colors",
                    rangeCount === n
                      ? "bg-indigo-600 text-white"
                      : "text-white/50 hover:bg-white/[0.06] hover:text-white/80"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Link back to simple view */}
          <div className="ml-auto">
            <Link
              href="/budget"
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors"
              style={{ color: "var(--t-muted)" }}
            >
              Простой вид
            </Link>
          </div>
        </div>

        {/* Table area */}
        <div className="flex-1 overflow-auto">
          {isPending && (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-white/[0.02] rounded animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <p className="text-red-400/70 text-sm text-center py-16">
              Не удалось загрузить матрицу бюджета
            </p>
          )}

          {data && (
            <div className="min-w-max">
              <table className="w-full border-collapse text-left">
                <thead>
                  {/* Period headers */}
                  <tr className="sticky top-0 z-20" style={{ background: "var(--app-sidebar-bg)" }}>
                    <th
                      className="text-[10px] font-semibold uppercase tracking-wider px-3 py-2 sticky left-0 z-30 min-w-[180px] border-b border-white/[0.06]"
                      style={{ color: "var(--t-faint)", background: "var(--app-sidebar-bg)" }}
                    >
                      Категория
                    </th>
                    <PeriodHeaders periods={periods} />
                  </tr>
                  {/* P / F sub-headers */}
                  <tr className="sticky top-[33px] z-20" style={{ background: "var(--app-sidebar-bg)" }}>
                    <th
                      className="sticky left-0 z-30 border-b border-white/[0.06]"
                      style={{ background: "var(--app-sidebar-bg)" }}
                    />
                    <SubHeaders count={rangeCount} />
                  </tr>
                </thead>

                <tbody>

                  {/* ── ДОХОДЫ ── */}
                  <SectionHeaderRow
                    label="Доходы"
                    colSpan={totalCols}
                    expanded={incomeOpen}
                    onToggle={() => setIncomeOpen((v) => !v)}
                  />
                  {incomeOpen && data.income_rows.map((row, i) => (
                    <CategoryDataRow
                      key={row.category_id ?? `inc-${i}`}
                      row={row}
                      periodCount={rangeCount}
                    />
                  ))}
                  <TotalsRow
                    label="Итого доходы"
                    totals={data.income_totals}
                    kind="income"
                    periodCount={rangeCount}
                  />

                  {/* ── РАСХОДЫ ── */}
                  <SectionHeaderRow
                    label="Расходы"
                    colSpan={totalCols}
                    expanded={expenseOpen}
                    onToggle={() => setExpenseOpen((v) => !v)}
                  />
                  {expenseOpen && data.expense_rows.map((row, i) => (
                    <CategoryDataRow
                      key={row.category_id ?? `exp-${i}`}
                      row={row}
                      periodCount={rangeCount}
                    />
                  ))}
                  <TotalsRow
                    label="Итого расходы"
                    totals={data.expense_totals}
                    kind="expense"
                    periodCount={rangeCount}
                  />

                  {/* ── ОТЛОЖИТЬ ── */}
                  {data.goal_rows.length > 0 && (
                    <>
                      <SectionHeaderRow
                        label="Отложить"
                        colSpan={totalCols}
                        expanded={goalsOpen}
                        onToggle={() => setGoalsOpen((v) => !v)}
                      />
                      {goalsOpen && data.goal_rows.map((row, i) => (
                        <GoalDataRow
                          key={row.goal_id ?? `goal-${i}`}
                          row={row}
                          periodCount={rangeCount}
                          kind="expense"
                        />
                      ))}
                      <TotalsRow
                        label="Итого отложить"
                        totals={data.goal_totals}
                        kind="expense"
                        periodCount={rangeCount}
                      />
                    </>
                  )}

                  {/* ── ВЗЯТЬ ИЗ ОТЛОЖЕННОГО ── */}
                  {data.withdrawal_rows.length > 0 && (
                    <>
                      <SectionHeaderRow
                        label="Взять из отложенного"
                        colSpan={totalCols}
                        expanded={withdrawOpen}
                        onToggle={() => setWithdrawOpen((v) => !v)}
                      />
                      {withdrawOpen && data.withdrawal_rows.map((row, i) => (
                        <GoalDataRow
                          key={row.goal_id ?? `wd-${i}`}
                          row={row}
                          periodCount={rangeCount}
                          kind="income"
                        />
                      ))}
                      <TotalsRow
                        label="Итого взять"
                        totals={data.withdrawal_totals}
                        kind="income"
                        periodCount={rangeCount}
                      />
                    </>
                  )}

                  {/* ── РЕЗУЛЬТАТ ── */}
                  <ResultRow result={data.result} periodCount={rangeCount} />

                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
