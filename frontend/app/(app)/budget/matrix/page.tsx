"use client";

import React, { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm } from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import type { BudgetMatrix, BudgetCell, BudgetRow, BudgetGoalRow, BudgetPeriod, BudgetSectionTotals } from "@/types/api";

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

// ── Editing state types ───────────────────────────────────────────────────────

interface PlanEditTarget {
  categoryId: number;
  kind: string;
  year: number;
  month: number;
  periodLabel: string;
  categoryTitle: string;
  currentAmount: number;
  currentNote: string;
}

interface EditingProps {
  openPlanEdit: (target: PlanEditTarget) => void;
  openFactDetail: (target: FactDetailTarget) => void;
}

// ── Plan Edit Modal ──────────────────────────────────────────────────────────

function PlanEditModal({
  target,
  onSave,
  onClose,
}: {
  target: PlanEditTarget;
  onSave: (amount: string, note: string, copyForward: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(target.currentAmount ? String(Math.round(target.currentAmount)) : "");
  const [note, setNote] = useState(target.currentNote);
  const [copyForward, setCopyForward] = useState(false);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const remainingMonths = 12 - target.month;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(amount, note, copyForward);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl p-5">
        <h3 className="text-[14px] font-semibold mb-0.5" style={{ color: "var(--t-primary)" }}>
          {target.categoryTitle}
        </h3>
        <p className="text-[12px] mb-4" style={{ color: "var(--t-faint)" }}>
          План на {target.periodLabel}
        </p>

        <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1">
          Сумма
        </label>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,\-]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="0"
          className="w-full px-3 h-10 text-base rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors tabular-nums"
        />

        <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1 mt-3">
          Комментарий
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
        />

        {remainingMonths > 0 && (
          <label className="flex items-center gap-2.5 mt-3 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={copyForward}
              onChange={(e) => setCopyForward(e.target.checked)}
              className="rounded"
            />
            <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
              Копировать до конца года
              <span className="ml-1 text-[11px]" style={{ color: "var(--t-faint)" }}>
                (+{remainingMonths} мес.)
              </span>
            </span>
          </label>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Fact Detail Modal ────────────────────────────────────────────────────────

interface FactDetailTarget {
  categoryId: number;
  categoryTitle: string;
  kind: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  factAmount: number;
}

interface TransactionRow {
  id: number;
  description: string | null;
  amount: string;
  occurred_at: string;
  wallet_title: string | null;
}

function FactDetailModal({ target, onClose }: { target: FactDetailTarget; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { data, isPending } = useQuery<{ items: TransactionRow[]; total: number }>({
    queryKey: ["budget-fact-detail", target.categoryId, target.dateFrom, target.dateTo, target.kind],
    queryFn: () =>
      api.get(`/api/v2/transactions?category_id=${target.categoryId}&operation_type=${target.kind}&date_from=${target.dateFrom}&date_to=${target.dateTo}&per_page=100`),
    staleTime: 30_000,
  });

  const items = data?.items ?? [];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="p-5 pb-3 shrink-0">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
            {target.categoryTitle}
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>
            Факт за {target.periodLabel} · {fmt(target.factAmount)} ₽
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {isPending && (
            <p className="text-[13px] py-4 text-center" style={{ color: "var(--t-faint)" }}>Загрузка…</p>
          )}
          {!isPending && items.length === 0 && (
            <p className="text-[13px] py-4 text-center" style={{ color: "var(--t-faint)" }}>Нет операций</p>
          )}
          {items.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] truncate" style={{ color: "var(--t-primary)" }}>
                  {tx.description || "Без описания"}
                </p>
                <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                  {new Date(tx.occurred_at).toLocaleDateString("ru-RU")}
                  {tx.wallet_title && ` · ${tx.wallet_title}`}
                </p>
              </div>
              <span className="text-[13px] font-medium tabular-nums shrink-0 ml-3" style={{ color: "var(--t-secondary)" }}>
                {parseFloat(tx.amount).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 pt-2 border-t border-white/[0.06] shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cell rendering ────────────────────────────────────────────────────────────

// Non-editable plan <td> (used in totals, goal rows, result row)
function PlanTd({ cell, isMuted }: { cell: BudgetCell; isMuted?: boolean }) {
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

// Editable plan <td> for category rows — click opens modal, hover shows note tooltip
function EditablePlanTd({
  cell,
  period,
  row,
  editing,
}: {
  cell: BudgetCell;
  period: BudgetPeriod;
  row: BudgetRow;
  editing: EditingProps;
}) {
  const { openPlanEdit } = editing;
  const canEdit = period.has_manual_plan && !!row.category_id && !row.is_group;

  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  const hasNote = !!cell.note;

  if (!hasPlan && !hasFact && !canEdit) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--t-faint)", opacity: 0.4 }}>—</td>;
  }

  function handleClick() {
    if (!canEdit) return;
    openPlanEdit({
      categoryId: row.category_id!,
      kind: row.kind,
      year: period.year,
      month: period.month,
      periodLabel: period.label,
      categoryTitle: row.title,
      currentAmount: cell.plan,
      currentNote: cell.note ?? "",
    });
  }

  return (
    <td
      className="tabular-nums text-right px-2 py-1.5 text-[12px] relative group"
      style={{ color: "var(--t-secondary)" }}
    >
      <span
        onClick={handleClick}
        className={clsx(
          canEdit && "cursor-pointer hover:text-indigo-400 transition-colors",
          hasNote && "border-b border-dotted border-indigo-400/40"
        )}
        title={cell.note || undefined}
      >
        {hasPlan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")}
        {hasNote && <span className="text-[9px] text-indigo-400/60 ml-0.5">*</span>}
      </span>
    </td>
  );
}

function FactCell({
  cell,
  kind,
  isBold,
  onClick,
}: {
  cell: BudgetCell;
  kind: "income" | "expense" | "neutral";
  isBold?: boolean;
  onClick?: () => void;
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
      {hasFact && onClick ? (
        <span onClick={onClick} className="cursor-pointer hover:underline">
          {fmt(cell.fact)}
        </span>
      ) : (
        hasFact ? fmt(cell.fact) : "—"
      )}
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
          <PlanTd key={`tp-${i}`} cell={cell} isMuted />
          <FactCell key={`tf-${i}`} cell={cell} kind={kind} isBold />
        </>
      ))}
      <PlanTd cell={totals.total} isMuted />
      <FactCell cell={totals.total} kind={kind} isBold />
    </tr>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryDataRow({
  row,
  periodCount,
  periods,
  editing,
}: {
  row: BudgetRow;
  periodCount: number;
  periods: BudgetPeriod[];
  editing: EditingProps;
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
      {row.cells.slice(0, periodCount).map((cell, i) => {
        const p = periods[i];
        const canClickFact = !!row.category_id && !row.is_group && cell.fact !== 0;
        return (
          <React.Fragment key={i}>
            <EditablePlanTd cell={cell} period={p} row={row} editing={editing} />
            <FactCell
              cell={cell}
              kind={kind}
              onClick={canClickFact ? () => editing.openFactDetail({
                categoryId: row.category_id!,
                categoryTitle: row.title,
                kind: row.kind,
                periodLabel: p.label,
                dateFrom: p.range_start,
                dateTo: p.range_end,
                factAmount: cell.fact,
              }) : undefined}
            />
          </React.Fragment>
        );
      })}
      <PlanTd cell={row.total} />
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
          <PlanTd key={`p-${i}`} cell={cell} />
          <FactCell key={`f-${i}`} cell={cell} kind={kind} />
        </>
      ))}
      <PlanTd cell={row.total} />
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

  const [planEditTarget, setPlanEditTarget] = useState<PlanEditTarget | null>(null);
  const [factDetailTarget, setFactDetailTarget] = useState<FactDetailTarget | null>(null);

  const qc = useQueryClient();

  async function savePlan(year: number, month: number, categoryId: number, kind: string, amount: string, note?: string, copyForward?: boolean) {
    const line = { category_id: categoryId, kind, plan_amount: amount || "0", note: note || null };
    const months = [month];
    if (copyForward) {
      for (let m = month + 1; m <= 12; m++) months.push(m);
    }
    for (const m of months) {
      await api.post("/api/v2/budget/plan", { year, month: m, lines: [line] });
    }
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

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

  const editingProps: EditingProps = {
    openPlanEdit: setPlanEditTarget,
    openFactDetail: setFactDetailTarget,
  };

  return (
    <>
      {factDetailTarget && (
        <FactDetailModal target={factDetailTarget} onClose={() => setFactDetailTarget(null)} />
      )}
      {planEditTarget && (
        <PlanEditModal
          target={planEditTarget}
          onSave={async (amount, note, copyForward) => {
            await savePlan(planEditTarget.year, planEditTarget.month, planEditTarget.categoryId, planEditTarget.kind, amount, note, copyForward);
            setPlanEditTarget(null);
          }}
          onClose={() => setPlanEditTarget(null)}
        />
      )}
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
                      periods={periods}
                      editing={editingProps}
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
                      periods={periods}
                      editing={editingProps}
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
