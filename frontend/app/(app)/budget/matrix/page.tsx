"use client";

import React, { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm, GripVertical, EyeOff, Eye } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
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

type PeriodKind = "past" | "current" | "future";

function getPeriodKind(p: BudgetPeriod): PeriodKind {
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (p.year < cy || (p.year === cy && p.month < cm)) return "past";
  if (p.year === cy && p.month === cm) return "current";
  return "future";
}

// Columns per period kind:
// past: Ф, Δ (2)  |  current: П, Ф, Ост (3)  |  future: П (1)
function periodColCount(kind: PeriodKind): number {
  return kind === "current" ? 3 : kind === "past" ? 2 : 1;
}

// Heatmap background for plan cells — subtle indigo tint
function planHeatBg(value: number, maxVal: number): string | undefined {
  if (!value || !maxVal || value <= 0) return undefined;
  const intensity = Math.min(value / maxVal, 1);
  const alpha = Math.round(intensity * 10 + 3); // 3-13%
  return `rgba(99, 102, 241, ${alpha / 100})`;
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
  goalId?: number;        // set for goal/withdrawal rows
  goalPlanType?: string;  // "goal" or "withdrawal"
}

interface EditingProps {
  openPlanEdit: (target: PlanEditTarget) => void;
  openFactDetail: (target: FactDetailTarget) => void;
  dragHandlers: DragHandlers;
  toggleVisibility?: (catId: number) => void;
  hiddenCatIds?: Set<number>;
  showHidden?: boolean;
}

interface DragHandlers {
  onDragStart: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragOver: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragEnd: (e: React.DragEvent) => void;
  dragOverId: number | null;
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
      <div className="w-full max-w-sm mx-4 bg-white dark:bg-[#1a1d23] border border-slate-200 dark:border-white/[0.09] rounded-2xl shadow-2xl p-5">
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
      <div className="w-full max-w-md mx-4 bg-white dark:bg-[#1a1d23] border border-slate-200 dark:border-white/[0.09] rounded-2xl shadow-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="p-5 pb-3 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
            {target.categoryTitle}
          </h3>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>
            Факт за {target.periodLabel} · {fmt(target.factAmount)} ₽
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {isPending && (
            <p className="text-[13px] py-8 text-center" style={{ color: "var(--t-faint)" }}>Загрузка…</p>
          )}
          {!isPending && items.length === 0 && (
            <p className="text-[13px] py-8 text-center" style={{ color: "var(--t-faint)" }}>Нет операций за этот период</p>
          )}
          {items.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-white/[0.05] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
                  {tx.description || "Без описания"}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                  {new Date(tx.occurred_at).toLocaleDateString("ru-RU")}
                  {tx.wallet_title && ` · ${tx.wallet_title}`}
                </p>
              </div>
              <span className={clsx("text-[14px] font-semibold tabular-nums shrink-0 ml-3",
                target.kind === "INCOME" ? "text-emerald-600" : "text-red-600"
              )}>
                {target.kind === "INCOME" ? "+" : "−"}{parseFloat(tx.amount).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 pt-3 border-t border-slate-200 dark:border-white/[0.06] shrink-0 flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
            Итого: {fmt(target.factAmount)} ₽ ({items.length} оп.)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors"
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
function PlanTd({ cell, isMuted, extraStyle }: { cell: BudgetCell; isMuted?: boolean; extraStyle?: React.CSSProperties }) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  if (!hasPlan && !hasFact) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", ...extraStyle }}>—</td>;
  }
  return (
    <td
      className="tabular-nums text-right px-2 py-1.5 text-[12px]"
      style={{ color: isMuted ? "#64748B" : "#475569", ...extraStyle }}
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
  heatBg,
  extraStyle,
}: {
  cell: BudgetCell;
  period: BudgetPeriod;
  row: BudgetRow;
  editing: EditingProps;
  heatBg?: string;
  extraStyle?: React.CSSProperties;
}) {
  const { openPlanEdit } = editing;
  const canEdit = period.has_manual_plan && !!row.category_id && !row.is_group;

  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  const hasNote = !!cell.note;

  if (!hasPlan && !hasFact && !canEdit) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", ...extraStyle }}>—</td>;
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
      style={{ color: "#475569", background: heatBg, ...extraStyle }}
    >
      <span
        onClick={handleClick}
        className={clsx(
          canEdit && "cursor-pointer hover:text-indigo-400 transition-colors",
          hasNote && "border-b border-dotted border-amber-400/60"
        )}
        title={cell.note || undefined}
      >
        {hasPlan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")}
        {hasNote && <span className="text-[9px] text-amber-400 ml-0.5 align-super font-bold drop-shadow-[0_0_3px_rgba(251,191,36,0.6)]">●</span>}
      </span>
    </td>
  );
}

function FactCell({
  cell,
  kind,
  isBold,
  onClick,
  extraStyle,
}: {
  cell: BudgetCell;
  kind: "income" | "expense" | "neutral";
  isBold?: boolean;
  onClick?: () => void;
  extraStyle?: React.CSSProperties;
}) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;

  let color = "#1E293B";
  if (hasFact && hasPlan) {
    const isGood =
      (kind === "income" && cell.fact >= cell.plan) ||
      (kind === "expense" && cell.fact <= cell.plan);
    color = isGood ? "#16A34A" : "#DC2626";
  }

  if (!hasFact && !hasPlan) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", ...extraStyle }}>—</td>;
  }

  return (
    <td
      className={clsx("tabular-nums text-right px-2 py-1.5 text-[13px]", isBold && "font-semibold")}
      style={{ color: hasFact ? color : "#D1D5DB", ...extraStyle }}
    >
      {hasFact && onClick ? (
        <span onClick={onClick} className="cursor-pointer hover:underline hover:text-indigo-600">
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
      {periods.map((p) => {
        const kind = getPeriodKind(p);
        return (
          <th
            key={p.index}
            colSpan={periodColCount(kind)}
            className={clsx(
              "text-[11px] font-bold uppercase tracking-wider px-2 py-2 text-center",
              kind === "current" ? "bg-indigo-50 dark:bg-indigo-500/[0.06]" : "bg-slate-100 dark:bg-transparent"
            )}
            style={{ color: kind === "current" ? "var(--t-primary)" : "var(--t-muted)", border: "1px solid #94A3B8" }}
          >
            {p.short_label}
          </th>
        );
      })}
      <th
        colSpan={2}
        className="text-[11px] font-bold uppercase tracking-wider px-2 py-2 text-center bg-slate-100 dark:bg-transparent"
        style={{ color: "var(--t-muted)", border: "1px solid #94A3B8" }}
      >
        Итого
      </th>
    </>
  );
}

const subHdrCls = "text-[10px] font-bold px-2 py-1 text-right bg-slate-200 dark:bg-[#0c1122]";
const subHdrStyle: React.CSSProperties = { color: "#334155", border: "1px solid #94A3B8" };

function SubHeaders({ periods }: { periods: BudgetPeriod[] }) {
  return (
    <>
      {periods.map((p) => {
        const kind = getPeriodKind(p);
        if (kind === "past") return (
          <React.Fragment key={p.index}>
            <th className={subHdrCls} style={subHdrStyle}>Ф</th>
            <th className={subHdrCls} style={subHdrStyle}>Δ</th>
          </React.Fragment>
        );
        if (kind === "current") return (
          <React.Fragment key={p.index}>
            <th className={clsx(subHdrCls, "bg-indigo-500/[0.06]")} style={subHdrStyle}>П</th>
            <th className={clsx(subHdrCls, "bg-indigo-500/[0.06]")} style={subHdrStyle}>Ф</th>
            <th className={clsx(subHdrCls, "bg-indigo-500/[0.06]")} style={subHdrStyle}>Ост</th>
          </React.Fragment>
        );
        // future
        return <th key={p.index} className={subHdrCls} style={subHdrStyle}>П</th>;
      })}
      {/* Итого: П + Ф */}
      <th className={subHdrCls} style={subHdrStyle}>П</th>
      <th className={subHdrCls} style={subHdrStyle}>Ф</th>
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
      className="cursor-pointer select-none transition-colors"
      onClick={onToggle}
      style={{ background: "#E2E8F0" }}
    >
      <td className="px-3 py-2 !bg-[#E2E8F0]" colSpan={1} style={{ border: "1px solid #94A3B8" }}>
        <div className="flex items-center gap-1.5">
          {expanded
            ? <ChevronDown size={12} className="text-slate-500" />
            : <ChevronRightSm size={12} className="text-slate-500" />
          }
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
            {label}
          </span>
        </div>
      </td>
      <td colSpan={colSpan - 1} style={{ border: "1px solid #94A3B8", background: "#E2E8F0" }} />
    </tr>
  );
}

// ── Totals row ────────────────────────────────────────────────────────────────

function TotalsRow({
  label,
  totals,
  kind,
  periodCount,
  periods,
}: {
  label: string;
  totals: BudgetSectionTotals;
  kind: "income" | "expense" | "neutral";
  periodCount: number;
  periods?: BudgetPeriod[];
}) {
  const labelColor =
    kind === "income" ? "rgb(52 211 153)" : kind === "expense" ? "rgb(248 113 113)" : "var(--t-primary)";

  return (
    <tr style={{ background: "#EEF2FF", borderTop: "2px solid #6366F1", borderBottom: "2px solid #6366F1" }}>
      <td
        className="text-[12px] font-extrabold px-3 py-2 sticky left-0 z-10"
        style={{ color: "#4338CA", background: "#EEF2FF", border: "1px solid #94A3B8" }}
      >
        {label}
      </td>
      {totals.cells.slice(0, periodCount).map((cell, i) => {
        const pk = periods?.[i] ? getPeriodKind(periods[i]) : "current";
        if (pk === "past") return (
          <React.Fragment key={i}>
            <FactCell cell={cell} kind={kind} isBold />
            <DeviationCell cell={cell} kind={kind} />
          </React.Fragment>
        );
        if (pk === "current") {
          const remainder = cell.plan - cell.fact;
          return (
            <React.Fragment key={i}>
              <PlanTd cell={cell} isMuted />
              <FactCell cell={cell} kind={kind} isBold />
              <td className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold bg-indigo-500/[0.03]" style={{ color: remainder >= 0 ? "var(--t-secondary)" : "rgb(248 113 113)" }}>
                {cell.plan ? fmt(remainder) : "—"}
              </td>
            </React.Fragment>
          );
        }
        // future
        return <PlanTd key={i} cell={cell} isMuted />;
      })}
      <PlanTd cell={totals.total} isMuted />
      <FactCell cell={totals.total} kind={kind} isBold />
    </tr>
  );
}

function DeviationCell({ cell, kind }: { cell: BudgetCell; kind: "income" | "expense" | "neutral" }) {
  if (!cell.plan && !cell.fact) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB" }}>—</td>;
  }
  const dev = cell.deviation;
  let color = "var(--t-faint)";
  if (dev !== 0 && cell.plan) {
    const isGood = (kind === "income" && dev >= 0) || (kind === "expense" && dev <= 0);
    color = isGood ? "rgb(52 211 153)" : "rgb(248 113 113)";
  }
  return (
    <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color }}>
      {dev !== 0 ? fmtSigned(dev) : "0"}
    </td>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────

function CategoryDataRow({
  row,
  periodCount,
  periods,
  editing,
  onDrop,
  maxPlanByPeriod,
}: {
  row: BudgetRow;
  periodCount: number;
  periods: BudgetPeriod[];
  editing: EditingProps;
  onDrop?: (e: React.DragEvent, catId: number) => void;
  maxPlanByPeriod?: number[];
}) {
  const kind: "income" | "expense" | "neutral" =
    row.kind === "INCOME" ? "income" : "expense";
  const isTopLevel = row.is_group || row.parent_id === null;
  const indent = row.depth > 0 ? "pl-8" : "pl-3";
  const { dragHandlers } = editing;
  const canDrag = !!row.category_id; // groups AND children can be dragged
  const canReceiveDrop = !!row.category_id;
  const isDropTarget = dragHandlers.dragOverId === row.category_id;

  return (
    <tr
      className={clsx(
        "transition-colors",
        isDropTarget && "!border-t-[3px] !border-t-indigo-500"
      )}
      data-drag-over={isDropTarget || undefined}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => dragHandlers.onDragStart(e, row.category_id!, row.parent_id) : undefined}
      onDragOver={canReceiveDrop ? (e) => dragHandlers.onDragOver(e, row.category_id!, row.parent_id) : undefined}
      onDragEnd={dragHandlers.onDragEnd}
      onDrop={canReceiveDrop && onDrop ? (e) => onDrop(e, row.category_id!) : undefined}
    >
      <td
        className={clsx(
          "text-[12px] py-1.5 sticky left-0 z-10 max-w-[200px] truncate",
          indent,
          isTopLevel ? "font-bold" : "font-normal"
        )}
        style={{
          color: isTopLevel ? "#0F172A" : "#1E293B",
          background: isTopLevel ? "#F1F5F9" : "#FAFBFD",
          borderRight: "2px solid #64748B",
        }}
        title={row.title}
      >
        <span className="inline-flex items-center gap-1 group/cat">
          {canDrag && (
            <GripVertical size={12} className="text-slate-300 cursor-grab shrink-0" />
          )}
          {row.depth > 0 && <span className="text-slate-300 text-[10px] mr-0.5">└</span>}
          <span className={editing.hiddenCatIds?.has(row.category_id!) ? "opacity-40 line-through" : ""}>
            {row.title}
          </span>
          {editing.showHidden && editing.toggleVisibility && row.category_id && (
            <button
              onClick={(e) => { e.stopPropagation(); editing.toggleVisibility!(row.category_id!); }}
              className="opacity-0 group-hover/cat:opacity-100 ml-1 shrink-0 transition-opacity"
              title={editing.hiddenCatIds?.has(row.category_id) ? "Показать в бюджете" : "Скрыть из бюджета"}
            >
              {editing.hiddenCatIds?.has(row.category_id) ? (
                <EyeOff size={11} className="text-red-400" />
              ) : (
                <Eye size={11} className="text-slate-400 hover:text-slate-600" />
              )}
            </button>
          )}
        </span>
      </td>
      {row.cells.slice(0, periodCount).map((cell, i) => {
        const p = periods[i];
        const pk = getPeriodKind(p);
        const canClickFact = !!row.category_id && cell.fact !== 0;
        const heatBg = maxPlanByPeriod ? planHeatBg(Math.abs(cell.plan), maxPlanByPeriod[i]) : undefined;
        const factClick = canClickFact ? () => editing.openFactDetail({
          categoryId: row.category_id!,
          categoryTitle: row.title,
          kind: row.kind,
          periodLabel: p.label,
          dateFrom: p.range_start,
          dateTo: p.range_end,
          factAmount: cell.fact,
        }) : undefined;

        const periodBorder = { borderLeft: "2px solid #94A3B8" } as React.CSSProperties;

        if (pk === "past") {
          return (
            <React.Fragment key={i}>
              <FactCell cell={cell} kind={kind} onClick={factClick} extraStyle={periodBorder} />
              <DeviationCell cell={cell} kind={kind} />
            </React.Fragment>
          );
        }
        if (pk === "current") {
          const remainder = cell.plan - cell.fact;
          return (
            <React.Fragment key={i}>
              <EditablePlanTd cell={cell} period={p} row={row} editing={editing} heatBg={heatBg} extraStyle={periodBorder} />
              <FactCell cell={cell} kind={kind} onClick={factClick} />
              <td className="tabular-nums text-right px-2 py-1.5 text-[12px] bg-indigo-500/[0.03]" style={{ color: remainder > 0 ? "var(--t-secondary)" : "rgb(248 113 113)" }}>
                {cell.plan ? fmt(remainder) : "—"}
              </td>
            </React.Fragment>
          );
        }
        // Future: П only
        return (
          <React.Fragment key={i}>
            <EditablePlanTd cell={cell} period={p} row={row} editing={editing} heatBg={heatBg} extraStyle={periodBorder} />
          </React.Fragment>
        );
      })}
      <PlanTd cell={row.total} extraStyle={{ borderLeft: "2px solid #64748B" }} />
      <FactCell cell={row.total} kind={kind} />
    </tr>
  );
}

// ── Goal row ──────────────────────────────────────────────────────────────────

function GoalDataRow({
  row,
  periodCount,
  kind,
  periods,
  editing,
  goalPlanType,
  isHidden,
  onToggleVisibility,
}: {
  row: BudgetGoalRow;
  periodCount: number;
  kind: "income" | "expense" | "neutral";
  periods?: BudgetPeriod[];
  editing?: EditingProps;
  goalPlanType?: string;
  isHidden?: boolean;
  onToggleVisibility?: () => void;
}) {
  function openGoalPlan(p: BudgetPeriod, cell: BudgetCell) {
    if (!editing || !p.has_manual_plan) return;
    editing.openPlanEdit({
      categoryId: 0,
      kind: kind === "income" ? "INCOME" : "EXPENSE",
      year: p.year,
      month: p.month,
      periodLabel: p.label,
      categoryTitle: row.title,
      currentAmount: cell.plan,
      currentNote: cell.note ?? "",
      goalId: row.goal_id,
      goalPlanType: goalPlanType || "goal",
    });
  }

  return (
    <tr className="transition-colors">
      <td
        className="text-[12px] py-1.5 px-3 sticky left-0 z-10 max-w-[200px] truncate font-normal"
        style={{ color: "#1E293B", background: "#FAFBFD", borderRight: "2px solid #64748B" }}
        title={row.title}
      >
        <span className="inline-flex items-center gap-1 group/goal">
          <GripVertical size={12} className="text-slate-300 cursor-grab shrink-0" />
          <span className={isHidden ? "opacity-40 line-through" : ""}>{row.title}</span>
          {onToggleVisibility && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
              className="opacity-0 group-hover/goal:opacity-100 ml-1 shrink-0 transition-opacity"
              title={isHidden ? "Показать в бюджете" : "Скрыть из бюджета"}
            >
              {isHidden ? <EyeOff size={11} className="text-red-400" /> : <Eye size={11} className="text-slate-400 hover:text-slate-600" />}
            </button>
          )}
        </span>
      </td>
      {row.cells.slice(0, periodCount).map((cell, i) => {
        const p = periods?.[i];
        const pk = p ? getPeriodKind(p) : "current";
        const canClick = !!p?.has_manual_plan && !!editing;
        const planSpan = (
          <span
            onClick={canClick && p ? () => openGoalPlan(p, cell) : undefined}
            className={canClick ? "cursor-pointer hover:text-indigo-400 transition-colors" : ""}
          >
            {cell.plan ? fmt(cell.plan) : (canClick ? <span style={{ opacity: 0.3 }}>—</span> : "—")}
          </span>
        );

        const pBorder = { borderLeft: "2px solid #94A3B8" } as React.CSSProperties;

        if (pk === "past") return (
          <React.Fragment key={i}>
            <FactCell cell={cell} kind={kind} extraStyle={pBorder} />
            <DeviationCell cell={cell} kind={kind} />
          </React.Fragment>
        );
        if (pk === "current") {
          const remainder = cell.plan - cell.fact;
          return (
            <React.Fragment key={i}>
              <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#475569", ...pBorder }}>{planSpan}</td>
              <FactCell cell={cell} kind={kind} />
              <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: remainder >= 0 ? "#475569" : "#DC2626" }}>
                {cell.plan ? fmt(remainder) : "—"}
              </td>
            </React.Fragment>
          );
        }
        // future
        return (
          <td key={i} className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#475569", ...pBorder }}>
            {planSpan}
          </td>
        );
      })}
      <PlanTd cell={row.total} extraStyle={{ borderLeft: "2px solid #64748B" }} />
      <FactCell cell={row.total} kind={kind} />
    </tr>
  );
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  result,
  periodCount,
  periods,
}: {
  result: BudgetMatrix["result"];
  periodCount: number;
  periods?: BudgetPeriod[];
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
        const pk = periods?.[i] ? getPeriodKind(periods[i]) : "current";
        const planColor = cell.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
        const factColor = cell.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
        const tdCls = "tabular-nums text-right px-2 py-2 text-[12px] font-semibold";

        const dev = cell.fact - cell.plan;
        if (pk === "past") return (
          <React.Fragment key={i}>
            <td className={tdCls} style={{ color: factColor }}>{fmtSigned(cell.fact)}</td>
            <td className={tdCls} style={{ color: dev >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)" }}>{fmtSigned(dev)}</td>
          </React.Fragment>
        );
        if (pk === "current") return (
          <React.Fragment key={i}>
            <td className={tdCls} style={{ color: planColor }}>{fmtSigned(cell.plan)}</td>
            <td className={tdCls} style={{ color: factColor }}>{fmtSigned(cell.fact)}</td>
            <td className={clsx(tdCls, "bg-indigo-500/[0.03]")} style={{ color: (cell.plan - cell.fact) >= 0 ? "var(--t-secondary)" : "rgb(248 113 113)" }}>{fmtSigned(cell.plan - cell.fact)}</td>
          </React.Fragment>
        );
        // future
        return <td key={i} className={tdCls} style={{ color: planColor }}>{fmtSigned(cell.plan)}</td>;
      })}
      <td className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold" style={{ color: result.total.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)" }}>
        {fmtSigned(result.total.plan)}
      </td>
      <td className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold" style={{ color: result.total.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)" }}>
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
  const [showHidden, setShowHidden] = useState(false);

  // ── Drag-and-drop reorder state ──
  const dragSrc = useRef<{ catId: number; parentId: number | null } | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, catId: number, parentId: number | null) => {
    dragSrc.current = { catId, parentId };
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, catId: number, parentId: number | null) => {
    if (!dragSrc.current) return;
    // Allow reorder within same parent group
    if (dragSrc.current.parentId !== parentId) return;
    if (dragSrc.current.catId === catId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(catId);
  }, []);

  const onDragEnd = useCallback((_e: React.DragEvent) => {
    setDragOverId(null);
    dragSrc.current = null;
  }, []);

  async function handleDrop(e: React.DragEvent, targetCatId: number, rows: BudgetRow[]) {
    e.preventDefault();
    setDragOverId(null);
    if (!dragSrc.current || dragSrc.current.catId === targetCatId) return;

    const srcId = dragSrc.current.catId;
    const parentId = dragSrc.current.parentId;
    dragSrc.current = null;

    // Get siblings: top-level items (parent_id=null) or children of same parent
    const siblings = rows.filter((r) =>
      r.category_id && r.parent_id === parentId
    );
    const ids = siblings.map((r) => r.category_id!);
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetCatId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    // Determine direction and insert accordingly
    const movingDown = srcIdx < tgtIdx;
    ids.splice(srcIdx, 1);
    const newTgtIdx = ids.indexOf(targetCatId);
    if (movingDown) {
      // Moving down: place AFTER target
      ids.splice(newTgtIdx + 1, 0, srcId);
    } else {
      // Moving up: place BEFORE target
      ids.splice(newTgtIdx, 0, srcId);
    }

    const items = ids.map((id, i) => ({ category_id: id, sort_order: i }));
    await api.post("/api/v2/categories/reorder", { items });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  const qc = useQueryClient();

  async function savePlan(target: PlanEditTarget, amount: string, note: string, copyForward: boolean) {
    const months = [target.month];
    if (copyForward) {
      for (let m = target.month + 1; m <= 12; m++) months.push(m);
    }

    if (target.goalId) {
      // Goal/withdrawal plan
      for (const m of months) {
        await api.post("/api/v2/budget/goal-plan", {
          year: target.year, month: m,
          lines: [{ goal_id: target.goalId, plan_amount: amount || "0", note: note || null }],
          plan_type: target.goalPlanType || "goal",
        });
      }
    } else {
      // Category plan
      const line = { category_id: target.categoryId, kind: target.kind, plan_amount: amount || "0", note: note || null };
      for (const m of months) {
        await api.post("/api/v2/budget/plan", { year: target.year, month: m, lines: [line] });
      }
    }
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  const { data, isPending, isError } = useQuery<BudgetMatrix & { hidden_category_ids?: number[] }>({
    queryKey: ["budget-matrix", year, month, rangeCount, showHidden],
    queryFn: () =>
      api.get<BudgetMatrix & { hidden_category_ids?: number[] }>(
        `/api/v2/budget/matrix?year=${year}&month=${month}&range_count=${rangeCount}&show_hidden=${showHidden}`
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

  const hiddenCatIds = new Set(data?.hidden_category_ids ?? []);
  const hiddenGoalIds = new Set((data as any)?.hidden_goal_ids ?? []);
  const hiddenWGoalIds = new Set((data as any)?.hidden_withdrawal_goal_ids ?? []);

  async function toggleGoalVisibility(goalId: number, section: "goal" | "withdrawal") {
    const ids = section === "withdrawal" ? hiddenWGoalIds : hiddenGoalIds;
    const isHidden = ids.has(goalId);
    await api.post("/api/v2/budget/toggle-goal-visibility", {
      goal_id: goalId,
      hidden: !isHidden,
      section,
    });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  async function toggleVisibility(categoryId: number) {
    const isHidden = hiddenCatIds.has(categoryId);
    await api.post("/api/v2/budget/toggle-visibility", {
      category_id: categoryId,
      hidden: !isHidden,
    });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  const periods = data?.periods ?? [];
  const periodLabel = periods.length > 0
    ? `${periods[0].short_label} — ${periods[periods.length - 1].short_label}`
    : `${month}/${year}`;

  // Dynamic column count based on period kind
  const periodCols = periods.reduce((sum, p) => sum + periodColCount(getPeriodKind(p)), 0);
  const totalCols = 1 + periodCols + 2; // category + period cols + итого (П+Ф)

  // Compute max plan per period for heatmap
  const maxPlanByPeriod: number[] = periods.map((_, pi) => {
    let mx = 0;
    for (const rows of [data?.income_rows, data?.expense_rows]) {
      for (const row of rows ?? []) {
        if (row.cells[pi]) mx = Math.max(mx, Math.abs(row.cells[pi].plan));
      }
    }
    return mx;
  });

  const editingProps: EditingProps = {
    openPlanEdit: setPlanEditTarget,
    openFactDetail: setFactDetailTarget,
    dragHandlers: { onDragStart, onDragOver, onDragEnd, dragOverId },
    toggleVisibility: showHidden ? toggleVisibility : undefined,
    hiddenCatIds: showHidden ? hiddenCatIds : undefined,
    showHidden,
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
            await savePlan(planEditTarget, amount, note, copyForward);
            setPlanEditTarget(null);
          }}
          onClose={() => setPlanEditTarget(null)}
        />
      )}
      <AppTopbar title="Бюджет (матрица)" />

      <main className="flex-1 flex flex-col overflow-hidden">

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

          {/* Controls right */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowHidden(v => !v)}
              className={clsx(
                "text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5",
                showHidden
                  ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              )}
            >
              {showHidden ? <Eye size={12} /> : <EyeOff size={12} />}
              {showHidden ? "Скрытые видны" : "Показать скрытые"}
            </button>
            <Link
              href="/budget"
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Простой вид
            </Link>
          </div>
        </div>

        {/* Table area — this div is the scroll container, sticky works inside it */}
        <div className="flex-1 overflow-auto relative">
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
              <style>{`
                .bgt-matrix { border-spacing: 0; }
                .bgt-matrix td, .bgt-matrix th { border: 1px solid #CBD5E1; }
                .bgt-matrix td { font-size: 13px; padding: 3px 7px; color: #0F172A; }
                .bgt-matrix td:first-child { border-right: 2px solid #64748B !important; background: #FAFBFD; position: sticky; left: 0; z-index: 5; font-size: 12px; }
                .bgt-matrix tr:hover td { background-color: #EFF6FF !important; }
                .bgt-matrix thead { position: sticky; top: 0; z-index: 20; }
                .bgt-matrix thead th { background: #EDF0F4; }
                .dark .bgt-matrix td { border-color: rgba(255,255,255,0.06); color: #E2E8F0; }
                .dark .bgt-matrix td:first-child { background: #0c1122; border-right-color: rgba(255,255,255,0.1); }
                .bgt-matrix tr[data-drag-over="true"] td:first-child { border-top: 3px solid #6366F1 !important; }
              `}</style>
              <table className="bgt-matrix w-full text-left" style={{ border: "1px solid #94A3B8", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  {/* Period headers */}
                  <tr className="bg-slate-100 dark:bg-[#0c1122]">
                    <th
                      className="text-[11px] font-bold uppercase tracking-wider px-3 py-2 sticky left-0 z-30 min-w-[180px] bg-slate-100 dark:bg-[#0c1122] text-slate-700 dark:text-slate-400"
                      style={{ border: "1px solid #94A3B8" }}
                    >
                      Категория
                    </th>
                    <PeriodHeaders periods={periods} />
                  </tr>
                  {/* P / F sub-headers */}
                  <tr className="bg-slate-200 dark:bg-[#0c1122]">
                    <th
                      className="sticky left-0 z-30 bg-slate-100 dark:bg-[#0c1122]"
                      style={{ border: "1px solid #94A3B8" }}
                    />
                    <SubHeaders periods={periods} />
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
                      maxPlanByPeriod={maxPlanByPeriod}
                      onDrop={(e, catId) => handleDrop(e, catId, data.income_rows)}
                    />
                  ))}
                  {/* Прочие доходы — always visible */}
                  {incomeOpen && (
                    <tr>
                      <td className="text-[12px] py-1.5 pl-3 italic" style={{ color: "var(--t-faint)", background: "#FAFBFD", borderRight: "2px solid #64748B" }}>
                        Прочие доходы
                      </td>
                      {(data.other_income?.cells ?? periods.map(() => ({ plan: 0, fact: 0 }))).slice(0, rangeCount).map((cell, i) => {
                        const pk = getPeriodKind(periods[i]);
                        const p = periods[i];
                        const clickFact = cell.fact ? () => setFactDetailTarget({ categoryId: -1, categoryTitle: "Прочие доходы", kind: "INCOME", periodLabel: p.label, dateFrom: p.range_start, dateTo: p.range_end, factAmount: cell.fact }) : undefined;
                        const factEl = cell.fact ? <span onClick={clickFact} className="cursor-pointer hover:underline hover:text-indigo-600">{fmt(cell.fact)}</span> : <span style={{ color: "#D1D5DB" }}>—</span>;
                        if (pk === "past") return (
                          <React.Fragment key={i}>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#1E293B", borderLeft: "2px solid #94A3B8" }}>{factEl}</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB" }}>—</td>
                          </React.Fragment>
                        );
                        if (pk === "current") return (
                          <React.Fragment key={i}>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", borderLeft: "2px solid #94A3B8" }}>—</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#1E293B" }}>{factEl}</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB" }}>—</td>
                          </React.Fragment>
                        );
                        return <td key={i} className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", borderLeft: "2px solid #94A3B8" }}>—</td>;
                      })}
                      <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ borderLeft: "2px solid #64748B" }}>—</td>
                      <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: data.other_income?.total?.fact ? "#1E293B" : "#D1D5DB" }}>{data.other_income?.total?.fact ? fmt(data.other_income.total.fact) : "—"}</td>
                    </tr>
                  )}
                  <TotalsRow
                    label="Итого доходы"
                    totals={data.income_totals}
                    kind="income"
                    periodCount={rangeCount}
                    periods={periods}
                  />

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
                          periods={periods}
                          editing={editingProps}
                          goalPlanType="withdrawal"
                          isHidden={showHidden && hiddenWGoalIds.has(row.goal_id)}
                          onToggleVisibility={showHidden && row.goal_id ? () => toggleGoalVisibility(row.goal_id, "withdrawal") : undefined}
                        />
                      ))}
                      <TotalsRow
                        label="Итого взять"
                        totals={data.withdrawal_totals}
                        kind="income"
                        periodCount={rangeCount}
                        periods={periods}
                      />
                    </>
                  )}

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
                      maxPlanByPeriod={maxPlanByPeriod}
                      onDrop={(e, catId) => handleDrop(e, catId, data.expense_rows)}
                    />
                  ))}
                  {/* Прочие расходы — always visible, clickable */}
                  {expenseOpen && (
                    <tr>
                      <td className="text-[12px] py-1.5 pl-3 italic" style={{ color: "var(--t-faint)", background: "#FAFBFD", borderRight: "2px solid #64748B" }}>
                        Прочие расходы
                      </td>
                      {(data.other_expense?.cells ?? periods.map(() => ({ plan: 0, fact: 0 }))).slice(0, rangeCount).map((cell, i) => {
                        const pk = getPeriodKind(periods[i]);
                        const p = periods[i];
                        const clickFact = cell.fact ? () => setFactDetailTarget({ categoryId: -1, categoryTitle: "Прочие расходы", kind: "EXPENSE", periodLabel: p.label, dateFrom: p.range_start, dateTo: p.range_end, factAmount: cell.fact }) : undefined;
                        const factEl = cell.fact ? <span onClick={clickFact} className="cursor-pointer hover:underline hover:text-indigo-600">{fmt(cell.fact)}</span> : <span style={{ color: "#D1D5DB" }}>—</span>;
                        if (pk === "past") return (
                          <React.Fragment key={i}>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#DC2626", borderLeft: "2px solid #94A3B8" }}>{factEl}</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB" }}>—</td>
                          </React.Fragment>
                        );
                        if (pk === "current") return (
                          <React.Fragment key={i}>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", borderLeft: "2px solid #94A3B8" }}>—</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#DC2626" }}>{factEl}</td>
                            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB" }}>—</td>
                          </React.Fragment>
                        );
                        return <td key={i} className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "#D1D5DB", borderLeft: "2px solid #94A3B8" }}>—</td>;
                      })}
                      <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ borderLeft: "2px solid #64748B" }}>—</td>
                      <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: data.other_expense?.total?.fact ? "#DC2626" : "#D1D5DB" }}>{data.other_expense?.total?.fact ? fmt(data.other_expense.total.fact) : "—"}</td>
                    </tr>
                  )}
                  <TotalsRow
                    label="Итого расходы"
                    totals={data.expense_totals}
                    kind="expense"
                    periodCount={rangeCount}
                    periods={periods}
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
                          periods={periods}
                          editing={editingProps}
                          goalPlanType="goal"
                          isHidden={showHidden && hiddenGoalIds.has(row.goal_id)}
                          onToggleVisibility={showHidden && row.goal_id ? () => toggleGoalVisibility(row.goal_id, "goal") : undefined}
                        />
                      ))}
                      <TotalsRow
                        label="Итого отложить"
                        totals={data.goal_totals}
                        kind="expense"
                        periodCount={rangeCount}
                        periods={periods}
                      />
                    </>
                  )}

                  {/* ── РЕЗУЛЬТАТ ── */}
                  <ResultRow result={data.result} periodCount={rangeCount} periods={periods} />

                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
