"use client";

import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSm, GripVertical, EyeOff, Eye, Pencil } from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import type { BudgetMatrix, BudgetCell, BudgetRow, BudgetGoalRow, BudgetPeriod, BudgetSectionTotals } from "@/types/api";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";

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
  openPlanEdit: (target: PlanEditTarget) => void;  // shift+click → copy-forward modal
  openFactDetail: (target: FactDetailTarget) => void;
  dragHandlers: DragHandlers;
  toggleVisibility?: (catId: number) => void;
  hiddenCatIds?: Set<number>;
  showHidden?: boolean;
  // Inline editing
  activeEditKey: string | null;
  inlineValue: string;
  onInlineStart: (key: string, currentValue: number, initialStr?: string) => void;
  onInlineChange: (value: string) => void;
  onInlineSave: (target: PlanEditTarget) => void;
  onInlineCancel: () => void;
  onTabNav: (dir: "next" | "prev", fromKey: string, savedTarget: PlanEditTarget) => void;
}

interface DragHandlers {
  onDragStart: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragOver: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  dragOver: { id: number; pos: "before" | "after" | "invalid" | "end" } | null;
}

// ── Inline cell input ────────────────────────────────────────────────────────

function InlineCellInput({
  value,
  onChange,
  onSave,
  onCancel,
  onTabNext,
  onTabPrev,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
}) {
  const cancelledRef = React.useRef(false);
  const tabbedRef = React.useRef(false);
  return (
    <input
      autoFocus
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,\-]/g, ""))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { cancelledRef.current = true; (e.target as HTMLInputElement).blur(); }
        if (e.key === "Tab") {
          e.preventDefault();
          tabbedRef.current = true;
          (e.target as HTMLInputElement).blur();
          if (e.shiftKey) onTabPrev?.();
          else onTabNext?.();
        }
      }}
      onBlur={() => {
        if (cancelledRef.current) { cancelledRef.current = false; onCancel(); return; }
        if (tabbedRef.current) { tabbedRef.current = false; return; }
        onSave();
      }}
      className="w-full min-w-[40px] text-right bg-transparent outline-none tabular-nums text-[12px] px-2 py-1.5"
      style={{ color: "var(--app-accent-ink)" }}
    />
  );
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

        <label className="block text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--t-faint)" }}>
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
          className="w-full px-3 h-10 text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors tabular-nums"
          style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}
        />

        <label className="block text-[11px] font-medium uppercase tracking-wider mb-1 mt-3" style={{ color: "var(--t-faint)" }}>
          Комментарий
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          className="w-full px-3 py-2 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-colors resize-none"
          style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}
        />

        {remainingMonths > 0 && (
          <div className="mt-3 py-1.5">
            <Checkbox
              checked={copyForward}
              onChange={(e) => setCopyForward(e.target.checked)}
              label={
                <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
                  Копировать до конца года
                  <span className="ml-1 text-[11px]" style={{ color: "var(--t-faint)" }}>
                    (+{remainingMonths} мес.)
                  </span>
                </span>
              }
            />
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[#fff] disabled:opacity-50 transition-colors"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl transition-colors"
            style={{ border: "1px solid var(--app-border)", color: "var(--t-muted)", background: "var(--app-card-bg)" }}
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
  excludeCategoryIds?: number[];
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
    queryKey: ["budget-fact-detail", target.categoryId, target.dateFrom, target.dateTo, target.kind, target.excludeCategoryIds?.join(",")],
    queryFn: () => {
      const excl = target.excludeCategoryIds;
      const filterParam = excl && excl.length > 0
        ? `exclude_category_ids=${excl.join(",")}`
        : `category_id=${target.categoryId}`;
      return api.get(`/api/v2/transactions?${filterParam}&operation_type=${target.kind}&date_from=${target.dateFrom}&date_to=${target.dateTo}&per_page=100`);
    },
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
function PlanTd({ cell, isMuted, extraStyle, totalCol }: { cell: BudgetCell; isMuted?: boolean; extraStyle?: React.CSSProperties; totalCol?: boolean }) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  const cls = clsx("tabular-nums text-right px-2 py-1.5 text-[12px]", totalCol && "bgt-tc-plan");
  if (!hasPlan && !hasFact) {
    return <td className={cls} style={{ color: "var(--bgt-dash)", ...extraStyle }}>—</td>;
  }
  return (
    <td className={cls} style={{ color: isMuted ? "var(--t-muted)" : "var(--t-secondary)", ...extraStyle }}>
      {hasPlan ? fmt(cell.plan) : "—"}
    </td>
  );
}

// Editable plan <td> — click = inline edit, Shift+click = modal (copy-forward)
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
  const canEdit = period.has_manual_plan && !!row.category_id && !row.is_group;
  const key = `cat:${row.category_id}:${row.kind}:${period.year}:${period.month}`;
  const isEditing = editing.activeEditKey === key;
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;
  const hasNote = !!cell.note;

  const target: PlanEditTarget = {
    categoryId: row.category_id!,
    kind: row.kind,
    year: period.year,
    month: period.month,
    periodLabel: period.label,
    categoryTitle: row.title,
    currentAmount: cell.plan,
    currentNote: cell.note ?? "",
  };

  if (isEditing) {
    return (
      <td className="tabular-nums p-0 text-[12px]" style={{ background: "var(--app-accent-weak)", ...extraStyle }}>
        <InlineCellInput
          value={editing.inlineValue}
          onChange={editing.onInlineChange}
          onSave={() => editing.onInlineSave(target)}
          onCancel={editing.onInlineCancel}
          onTabNext={() => { editing.onInlineSave(target); editing.onTabNav("next", key, target); }}
          onTabPrev={() => { editing.onInlineSave(target); editing.onTabNav("prev", key, target); }}
        />
      </td>
    );
  }

  if (!hasPlan && !hasFact && !canEdit) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)", ...extraStyle }}>—</td>;
  }

  return (
    <td
      className="tabular-nums text-right px-2 py-1.5 text-[12px] relative group outline-none"
      tabIndex={canEdit ? 0 : undefined}
      style={{ color: "var(--t-muted)", background: heatBg, ...extraStyle }}
      onKeyDown={canEdit ? (e) => {
        if (/^[0-9]$/.test(e.key)) { e.preventDefault(); editing.onInlineStart(key, 0, e.key); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editing.onInlineStart(key, cell.plan); }
        else if (e.key === "n") { e.preventDefault(); editing.openPlanEdit(target); }
      } : undefined}
    >
      {canEdit && (
        <button
          type="button"
          className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-400"
          style={{ color: "var(--t-faint)", padding: 2 }}
          title="Изменить с комментарием"
          onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(target); }}
        >
          <Pencil size={9} />
        </button>
      )}
      <span
        onClick={(e) => {
          if (!canEdit) return;
          editing.onInlineStart(key, cell.plan);
        }}
        className={clsx(
          canEdit && "cursor-pointer hover:text-indigo-400 transition-colors",
          hasNote && "border-b border-dotted border-amber-400/60"
        )}
        title={cell.note ? `📝 ${cell.note}` : (canEdit ? "Клик — изменить · N — с комментарием" : undefined)}
      >
        {hasPlan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")}
        {hasNote && (
          <span
            className="text-[9px] text-amber-400 ml-0.5 align-super font-bold drop-shadow-[0_0_3px_rgba(251,191,36,0.6)] cursor-pointer"
            title={`📝 ${cell.note} — нажмите чтобы изменить`}
            onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(target); }}
          >●</span>
        )}
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
  totalCol,
}: {
  cell: BudgetCell;
  kind: "income" | "expense" | "neutral";
  isBold?: boolean;
  onClick?: () => void;
  extraStyle?: React.CSSProperties;
  totalCol?: boolean;
}) {
  const hasFact = cell.fact !== 0;
  const hasPlan = cell.plan !== 0;

  let color = "var(--t-primary)";
  if (hasFact && hasPlan) {
    const isGood =
      (kind === "income" && cell.fact >= cell.plan) ||
      (kind === "expense" && cell.fact <= cell.plan);
    color = isGood ? "rgb(22 163 74)" : "rgb(220 38 38)";
  }

  if (!hasFact && !hasPlan) {
    return <td className={clsx("tabular-nums text-right px-2 py-1.5 text-[12px]", totalCol && "bgt-tc-fact")} style={{ color: "var(--bgt-dash)", ...extraStyle }}>—</td>;
  }

  return (
    <td
      className={clsx("tabular-nums text-right px-2 py-1.5 text-[13px]", isBold && "font-semibold", totalCol && "bgt-tc-fact")}
      style={{ color: hasFact ? color : "var(--bgt-dash)", ...extraStyle }}
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
  const firstYear = periods[0]?.year;
  const multiYear = periods.some(p => p.year !== firstYear);
  const totHdrStyle = { color: "var(--t-muted)", background: "var(--bgt-head-bg)", border: "1px solid var(--bgt-cell-border-strong)" };
  return (
    <>
      {periods.map((p) => {
        const kind = getPeriodKind(p);
        const label = multiYear ? `${p.short_label} '${String(p.year).slice(2)}` : p.short_label;
        return (
          <th
            key={p.index}
            colSpan={periodColCount(kind)}
            className={clsx(
              "text-[11px] font-bold uppercase tracking-wider px-2 py-2 text-center",
              kind === "current" ? "bg-indigo-50 dark:bg-indigo-500/[0.06]" : ""
            )}
            style={{
              color: kind === "current" ? "var(--t-primary)" : "var(--t-muted)",
              background: kind !== "current" ? "var(--bgt-head-bg)" : undefined,
              border: "1px solid var(--bgt-cell-border-strong)",
            }}
          >
            {label}
          </th>
        );
      })}
      <th className="text-[11px] font-bold uppercase tracking-wider px-2 py-2 text-center bgt-th-plan" style={totHdrStyle}>П</th>
      <th className="text-[11px] font-bold uppercase tracking-wider px-2 py-2 text-center bgt-th-fact" style={totHdrStyle}>Ф</th>
    </>
  );
}

const subHdrCls = "text-[10px] font-bold px-2 py-1 text-right";
const subHdrStyle: React.CSSProperties = { color: "var(--t-label)", border: "1px solid var(--bgt-cell-border-strong)", background: "var(--bgt-subhead-bg)" };

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
      <th className={clsx(subHdrCls, "bgt-th-plan")} style={subHdrStyle}>П</th>
      <th className={clsx(subHdrCls, "bgt-th-fact")} style={subHdrStyle}>Ф</th>
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
      style={{ background: "var(--bgt-section-bg)" }}
    >
      <td className="px-3 py-2" colSpan={1} style={{ border: "1px solid var(--bgt-cell-border-strong)", background: "var(--bgt-section-bg)" }}>
        <div className="flex items-center gap-1.5">
          {expanded
            ? <ChevronDown size={12} style={{ color: "var(--t-muted)" }} />
            : <ChevronRightSm size={12} style={{ color: "var(--t-muted)" }} />
          }
          <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--t-muted)" }}>
            {label}
          </span>
        </div>
      </td>
      <td colSpan={colSpan - 1} style={{ border: "1px solid var(--bgt-cell-border-strong)", background: "var(--bgt-section-bg)" }} />
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
  return (
    <tr style={{ background: "var(--bgt-totals-bg)", borderTop: "2px solid var(--app-accent)", borderBottom: "2px solid var(--app-accent)" }}>
      <td
        className="text-[12px] font-extrabold px-3 py-2 sticky left-0 z-10"
        style={{ color: "var(--app-accent-ink)", background: "var(--bgt-totals-bg)", border: "1px solid var(--bgt-cell-border-strong)" }}
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
      <PlanTd cell={totals.total} isMuted extraStyle={{ background: "var(--bgt-totals-bg)" }} totalCol />
      <FactCell cell={totals.total} kind={kind} isBold extraStyle={{ background: "var(--bgt-totals-bg)" }} totalCol />
    </tr>
  );
}

function DeviationCell({ cell, kind }: { cell: BudgetCell; kind: "income" | "expense" | "neutral" }) {
  if (!cell.plan && !cell.fact) {
    return <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)" }}>—</td>;
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
  const dragOverState = dragHandlers.dragOver?.id === row.category_id ? dragHandlers.dragOver : null;

  return (
    <tr
      className={clsx(
        "transition-colors",
        dragOverState?.pos === "invalid" && "!bg-red-50 dark:!bg-red-500/[0.06]",
      )}
      style={
        dragOverState?.pos === "before"
          ? { boxShadow: "inset 0 3px 0 #6366F1" }
          : dragOverState?.pos === "after"
          ? { boxShadow: "inset 0 -3px 0 #6366F1" }
          : undefined
      }
      onDragOver={canReceiveDrop ? (e) => dragHandlers.onDragOver(e, row.category_id!, row.parent_id) : undefined}
      onDragLeave={dragHandlers.onDragLeave}
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
          color: "var(--t-primary)",
          background: isTopLevel ? "var(--bgt-row-group)" : "var(--bgt-row-bg)",
          borderRight: "2px solid var(--bgt-sticky-border)",
        }}
        title={row.title}
      >
        <span className="inline-flex items-center gap-1 group/cat">
          {canDrag && (
            <span
              draggable
              onDragStart={(e) => dragHandlers.onDragStart(e, row.category_id!, row.parent_id)}
              className="cursor-grab"
              style={{ lineHeight: 0 }}
            >
              <GripVertical size={12} className="text-slate-300 shrink-0 pointer-events-none" />
            </span>
          )}
          {row.depth > 0 && <span className="text-slate-300 text-[10px] mr-0.5">└</span>}
          <span className={editing.hiddenCatIds?.has(row.category_id!) ? "opacity-40 line-through" : ""}>
            {row.title}
          </span>
          {editing.showHidden && editing.toggleVisibility && row.category_id && (
            <Tooltip content={editing.hiddenCatIds?.has(row.category_id) ? "Показать в бюджете" : "Скрыть из бюджета"}>
              <button
                onClick={(e) => { e.stopPropagation(); editing.toggleVisibility!(row.category_id!); }}
                className="opacity-0 group-hover/cat:opacity-100 ml-1 shrink-0 transition-opacity"
              >
                {editing.hiddenCatIds?.has(row.category_id) ? (
                  <EyeOff size={11} className="text-red-400" />
                ) : (
                  <Eye size={11} className="text-slate-400 hover:text-slate-600" />
                )}
              </button>
            </Tooltip>
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

        const periodBorder = { borderLeft: "2px solid var(--bgt-cell-border-strong)" } as React.CSSProperties;

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
      <PlanTd cell={row.total} extraStyle={{ borderLeft: "2px solid var(--bgt-sticky-border)", background: "var(--bgt-row-bg)" }} totalCol />
      <FactCell cell={row.total} kind={kind} extraStyle={{ background: "var(--bgt-row-bg)" }} totalCol />
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
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
  dragOverPos,
}: {
  row: BudgetGoalRow;
  periodCount: number;
  kind: "income" | "expense" | "neutral";
  periods?: BudgetPeriod[];
  editing?: EditingProps;
  goalPlanType?: string;
  isHidden?: boolean;
  onToggleVisibility?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  dragOverPos?: "before" | "after" | null;
}) {
  return (
    <tr
      className="transition-colors"
      style={
        dragOverPos === "before"
          ? { boxShadow: "inset 0 3px 0 #6366F1" }
          : dragOverPos === "after"
          ? { boxShadow: "inset 0 -3px 0 #6366F1" }
          : undefined
      }
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
    >
      <td
        className="text-[12px] py-1.5 px-3 sticky left-0 z-10 max-w-[200px] truncate font-normal"
        style={{ color: "var(--t-secondary)", background: "var(--bgt-row-bg)", borderRight: "2px solid var(--bgt-sticky-border)" }}
        title={row.title}
      >
        <span className="inline-flex items-center gap-1 group/goal">
          <span
            draggable={!!onDragStart}
            onDragStart={onDragStart}
            className={onDragStart ? "cursor-grab" : ""}
            style={{ lineHeight: 0 }}
          >
            <GripVertical size={12} className="text-slate-300 shrink-0 pointer-events-none" />
          </span>
          <span className={isHidden ? "opacity-40 line-through" : ""}>{row.title}</span>
          {onToggleVisibility && (
            <Tooltip content={isHidden ? "Показать в бюджете" : "Скрыть из бюджета"}>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
                className="opacity-0 group-hover/goal:opacity-100 ml-1 shrink-0 transition-opacity"
              >
                {isHidden ? <EyeOff size={11} className="text-red-400" /> : <Eye size={11} className="text-slate-400 hover:text-slate-600" />}
              </button>
            </Tooltip>
          )}
        </span>
      </td>
      {row.cells.slice(0, periodCount).map((cell, i) => {
        const p = periods?.[i];
        const pk = p ? getPeriodKind(p) : "current";
        const canEdit = !!p?.has_manual_plan && !!editing;
        const key = `goal:${row.goal_id}:${goalPlanType ?? "goal"}:${p?.year}:${p?.month}`;
        const isInlineEditing = canEdit && editing?.activeEditKey === key;

        const target: PlanEditTarget | undefined = p ? {
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
        } : undefined;

        const pBorder = { borderLeft: "2px solid var(--bgt-cell-border-strong)" } as React.CSSProperties;

        if (pk === "past") return (
          <React.Fragment key={i}>
            <FactCell cell={cell} kind={kind} extraStyle={pBorder} />
            <DeviationCell cell={cell} kind={kind} />
          </React.Fragment>
        );

        const planTd = isInlineEditing && editing && target ? (
          <td className="tabular-nums p-0 text-[12px]" style={{ background: "var(--app-accent-weak)", ...pBorder }}>
            <InlineCellInput
              value={editing.inlineValue}
              onChange={editing.onInlineChange}
              onSave={() => editing.onInlineSave(target)}
              onCancel={editing.onInlineCancel}
              onTabNext={() => { editing.onInlineSave(target); editing.onTabNav("next", key, target); }}
              onTabPrev={() => { editing.onInlineSave(target); editing.onTabNav("prev", key, target); }}
            />
          </td>
        ) : (
          <td className="tabular-nums text-right px-2 py-1.5 text-[12px] relative group" style={{ color: "var(--t-muted)", ...pBorder }}>
            {canEdit && editing && target && (
              <button
                type="button"
                className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-400"
                style={{ color: "var(--t-faint)", padding: 2 }}
                title="Изменить с комментарием"
                onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(target); }}
              >
                <Pencil size={9} />
              </button>
            )}
            <span
              onClick={(e) => {
                if (!canEdit || !editing || !target) return;
                editing.onInlineStart(key, cell.plan);
              }}
              className={canEdit ? "cursor-pointer hover:text-indigo-400 transition-colors" : ""}
            >
              {cell.plan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")}
              {cell.note && (
                <span
                  className="text-[9px] text-amber-400 ml-0.5 align-super font-bold cursor-pointer"
                  title={`📝 ${cell.note}`}
                  onClick={(e) => { e.stopPropagation(); editing?.openPlanEdit(target!); }}
                >●</span>
              )}
            </span>
          </td>
        );

        if (pk === "current") {
          const remainder = cell.plan - cell.fact;
          return (
            <React.Fragment key={i}>
              {planTd}
              <FactCell cell={cell} kind={kind} />
              <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: remainder >= 0 ? "var(--t-muted)" : "#DC2626" }}>
                {cell.plan ? fmt(remainder) : "—"}
              </td>
            </React.Fragment>
          );
        }
        // future
        return <React.Fragment key={i}>{planTd}</React.Fragment>;
      })}
      <PlanTd cell={row.total} extraStyle={{ borderLeft: "2px solid var(--bgt-sticky-border)", background: "var(--bgt-row-bg)" }} totalCol />
      <FactCell cell={row.total} kind={kind} extraStyle={{ background: "var(--bgt-row-bg)" }} totalCol />
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
    <tr className="border-t-2" style={{ borderColor: "var(--bgt-cell-border-strong)" }}>
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
      <td className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold bgt-tc-plan" style={{ color: result.total.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)", background: "var(--app-sidebar-bg)" }}>
        {fmtSigned(result.total.plan)}
      </td>
      <td className="tabular-nums text-right px-2 py-2 text-[12px] font-semibold bgt-tc-fact" style={{ color: result.total.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)", background: "var(--app-sidebar-bg)" }}>
        {fmtSigned(result.total.fact)}
      </td>
    </tr>
  );
}

// ── Balance forecast row ──────────────────────────────────────────────────────

function ForecastRow({
  walletBalance,
  periodCount,
  periods,
  incomeTotals,
  expenseTotals,
  withdrawalTotals,
  goalTotals,
}: {
  walletBalance: number;
  periodCount: number;
  periods: BudgetPeriod[];
  incomeTotals: BudgetSectionTotals;
  expenseTotals: BudgetSectionTotals;
  withdrawalTotals: BudgetSectionTotals;
  goalTotals: BudgetSectionTotals;
}) {
  const currentIdx = periods.findIndex((p) => getPeriodKind(p) !== "past");
  const startIdx = currentIdx < 0 ? periodCount : currentIdx;

  // For a period: remaining = plan - fact for current, full plan for future
  function remaining(cells: BudgetCell[], i: number): number {
    const cell = cells[i];
    if (!cell) return 0;
    const pk = periods[i] ? getPeriodKind(periods[i]) : "future";
    return pk === "current" ? cell.plan - cell.fact : cell.plan;
  }

  // Cumulative projected balance: walletBalance already includes all fact transactions,
  // so we add only what is still expected (remaining plan per period)
  const projected: (number | null)[] = [];
  let running = walletBalance;
  for (let i = 0; i < periodCount; i++) {
    if (i < startIdx) { projected.push(null); continue; }
    running += remaining(incomeTotals.cells, i)
             - remaining(expenseTotals.cells, i)
             + remaining(withdrawalTotals.cells, i)
             - remaining(goalTotals.cells, i);
    projected.push(running);
  }

  const tdVal = "tabular-nums text-right px-2 py-1.5 text-[12px]";
  const tdBold = "tabular-nums text-right px-2 py-2 text-[12px] font-bold";
  const labelCls = "text-[11px] px-3 py-1.5 sticky left-0 z-10";
  const rowBg = "var(--bgt-row-bg)";
  const stickyBorder = "2px solid var(--bgt-sticky-border)";

  // Renders one period's cells for a "plan-only" row (no colSpan — matches TotalsRow structure)
  function periodCells(i: number, val: number | null, color: string) {
    const pk = periods[i] ? getPeriodKind(periods[i]) : "current";
    const show = val !== null;
    const cell = show
      ? <span style={{ color }}>{fmt(val as number)}</span>
      : null;
    if (pk === "past") return (
      <React.Fragment key={i}>
        <td className={tdVal}>{cell}</td>
        <td />
      </React.Fragment>
    );
    if (pk === "current") return (
      <React.Fragment key={i}>
        <td className={tdVal}>{cell}</td>
        <td />
        <td />
      </React.Fragment>
    );
    return <td key={i} className={tdVal}>{cell}</td>;
  }

  // Renders one complete "remaining plan per period" row
  // Current period shows plan−fact (what's still expected); future shows full plan
  function planRow(label: string, cells: BudgetCell[], color: string) {
    // Total = sum of remaining values across current+future periods
    const totalRemaining = cells.slice(startIdx, periodCount).reduce((s, _, i) => s + remaining(cells, startIdx + i), 0);
    return (
      <tr>
        <td className={labelCls} style={{ color: "var(--t-secondary)", background: rowBg, borderRight: stickyBorder }}>
          {label}
        </td>
        {cells.slice(0, periodCount).map((_, i) =>
          periodCells(i, i >= startIdx ? remaining(cells, i) : null, color)
        )}
        <td className={clsx(tdVal, "bgt-tc-plan")} style={{ color, background: "var(--app-sidebar-bg)" }}>
          {fmt(totalRemaining)}
        </td>
        <td className="bgt-tc-fact" style={{ background: "var(--app-sidebar-bg)" }} />
      </tr>
    );
  }

  return (
    <>
      {/* Top separator */}
      <tr>
        <td className="sticky left-0 z-10" style={{ background: "var(--app-sidebar-bg)", borderTop: "2px solid var(--bgt-cell-border-strong)" }} />
        {periods.slice(0, periodCount).map((p, i) => {
          const pk = getPeriodKind(p);
          if (pk === "past") return <React.Fragment key={i}><td style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} /><td style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} /></React.Fragment>;
          if (pk === "current") return <React.Fragment key={i}><td style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} /><td style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} /><td style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} /></React.Fragment>;
          return <td key={i} style={{ borderTop: "2px solid var(--bgt-cell-border-strong)" }} />;
        })}
        <td className="bgt-tc-plan" style={{ background: "var(--app-sidebar-bg)", borderTop: "2px solid var(--bgt-cell-border-strong)" }} />
        <td className="bgt-tc-fact" style={{ background: "var(--app-sidebar-bg)", borderTop: "2px solid var(--bgt-cell-border-strong)" }} />
      </tr>

      {/* Баланс сейчас — shown only in the current period's plan cell */}
      <tr>
        <td className={labelCls} style={{ color: "var(--t-secondary)", background: rowBg, borderRight: stickyBorder }}>
          Баланс сейчас
        </td>
        {periods.slice(0, periodCount).map((p, i) => {
          const pk = getPeriodKind(p);
          const show = i === startIdx;
          if (pk === "past") return <React.Fragment key={i}><td /><td /></React.Fragment>;
          if (pk === "current") return (
            <React.Fragment key={i}>
              <td className={tdVal} style={{ color: show ? "var(--t-primary)" : undefined }}>{show ? fmt(walletBalance) : null}</td>
              <td />
              <td />
            </React.Fragment>
          );
          return <td key={i} />;
        })}
        <td className={clsx(tdVal, "bgt-tc-plan")} style={{ color: "var(--t-primary)", background: "var(--app-sidebar-bg)" }}>{fmt(walletBalance)}</td>
        <td className="bgt-tc-fact" style={{ background: "var(--app-sidebar-bg)" }} />
      </tr>

      {planRow("Доходы", incomeTotals.cells, "rgb(52 211 153)")}
      {planRow("Расходы", expenseTotals.cells, "rgb(248 113 113)")}
      {planRow("Взять из отложенного", withdrawalTotals.cells, "rgb(96 165 250)")}
      {planRow("Отложить", goalTotals.cells, "rgb(167 139 250)")}

      {/* Остаток на конец — cumulative projected balance */}
      <tr>
        <td className="text-[12px] font-bold px-3 py-2 sticky left-0 z-10"
          style={{ color: "var(--t-primary)", background: "var(--app-sidebar-bg)", borderRight: stickyBorder, borderTop: "1px solid var(--bgt-cell-border-strong)" }}>
          Остаток на конец
        </td>
        {periods.slice(0, periodCount).map((p, i) => {
          const pk = getPeriodKind(p);
          const val = projected[i];
          const color = val != null && val >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
          const borderTop = "1px solid var(--bgt-cell-border-strong)";
          if (pk === "past") return <React.Fragment key={i}><td style={{ borderTop }} /><td style={{ borderTop }} /></React.Fragment>;
          if (pk === "current") return (
            <React.Fragment key={i}>
              <td className={tdBold} style={{ color: val != null ? color : undefined, borderTop }}>{val != null ? fmt(val) : null}</td>
              <td style={{ borderTop }} />
              <td style={{ borderTop }} />
            </React.Fragment>
          );
          return <td key={i} className={tdBold} style={{ color: val != null ? color : undefined, borderTop }}>{val != null ? fmt(val) : null}</td>;
        })}
        <td className="bgt-tc-plan" style={{ background: "var(--app-sidebar-bg)", borderTop: "1px solid var(--bgt-cell-border-strong)" }} />
        <td className="bgt-tc-fact" style={{ background: "var(--app-sidebar-bg)", borderTop: "1px solid var(--bgt-cell-border-strong)" }} />
      </tr>
    </>
  );
}

// ── Period picker ─────────────────────────────────────────────────────────────

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

interface PeriodSelection { year: number; month: number; rangeCount: number; }

function PeriodPicker({ value, onChange, label }: {
  value: PeriodSelection;
  onChange: (v: PeriodSelection) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [cYear, setCYear] = useState(value.year);
  const [cMonth, setCMonth] = useState(value.month);
  const [cCount, setCCount] = useState(value.rangeCount);

  React.useEffect(() => { setCYear(value.year); setCMonth(value.month); setCCount(value.rangeCount); }, [value.year, value.month, value.rangeCount]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 318);
      setDropPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen(v => !v);
  }

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!dropRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const curQStart = Math.floor((cm - 1) / 3) * 3 + 1;
  const prevQStart = curQStart > 3 ? curQStart - 3 : 10;
  const prevQYear = curQStart > 3 ? cy : cy - 1;
  const prevM = cm === 1 ? 12 : cm - 1;
  const prevMY = cm === 1 ? cy - 1 : cy;

  const presets: Array<{ label: string } & PeriodSelection> = [
    { label: "Текущий месяц",    year: cy,       month: cm,          rangeCount: 1  },
    { label: "Текущий квартал",  year: cy,       month: curQStart,   rangeCount: 3  },
    { label: "Текущий год",      year: cy,       month: 1,           rangeCount: 12 },
    { label: "Прошлый месяц",    year: prevMY,   month: prevM,       rangeCount: 1  },
    { label: "Прошлый квартал",  year: prevQYear,month: prevQStart,  rangeCount: 3  },
    { label: "Прошлый год",      year: cy - 1,   month: 1,           rangeCount: 12 },
  ];

  const apply = (v: PeriodSelection) => { onChange(v); setOpen(false); };

  const dropdown = open ? (
    <div
      ref={dropRef}
      className="rounded-xl shadow-2xl p-4"
      style={{
        position: "fixed",
        top: dropPos.top,
        left: dropPos.left,
        zIndex: 9999,
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
        minWidth: 310,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>Быстрый выбор</p>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => apply(p)}
            className="text-[11px] font-medium px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--app-accent-weak)]"
            style={{ color: "var(--t-secondary)", border: "1px solid var(--app-border)" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>Произвольный период</p>
        <div className="flex items-center gap-2">
          <select value={cYear} onChange={e => setCYear(+e.target.value)}
            className="h-8 px-2 rounded-lg text-[12px] flex-1"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}>
            {[cy-3,cy-2,cy-1,cy,cy+1,cy+2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={cMonth} onChange={e => setCMonth(+e.target.value)}
            className="h-8 px-2 rounded-lg text-[12px] flex-1"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}>
            {MONTHS_RU.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] shrink-0" style={{ color: "var(--t-faint)" }}>Периодов:</span>
          <div className="flex gap-px">
            {[1,2,3,4,6,12].map(n => (
              <button key={n} onClick={() => setCCount(n)}
                className={clsx("w-7 h-6 text-[11px] font-medium rounded transition-colors",
                  cCount === n ? "bg-indigo-600 text-[#fff]" : "hover:bg-[var(--app-accent-light)]")}
                style={cCount !== n ? { color: "var(--t-muted)" } : undefined}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => apply({ year: cYear, month: cMonth, rangeCount: cCount })}
          className="mt-3 w-full py-2 text-[12px] font-semibold rounded-lg bg-indigo-600 text-[#fff] hover:bg-indigo-500 transition-colors"
        >
          Применить
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--app-accent-weak)]"
        style={{ color: "var(--t-primary)", border: "1px solid var(--app-border)", background: "var(--app-card-bg)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {label}
        <ChevronDown size={13} style={{ color: "var(--t-muted)", flexShrink: 0 }} />
      </button>
      {typeof window !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </>
  );
}

// ── "Прочие" row (income / expense uncategorised) ────────────────────────────

function OtherRow({
  label,
  kind,
  cells,
  total,
  periods,
  rangeCount,
  onFactClick,
  shownCategoryIds,
}: {
  label: string;
  kind: "INCOME" | "EXPENSE";
  cells?: BudgetCell[];
  total?: BudgetCell | null;
  periods: BudgetPeriod[];
  rangeCount: number;
  onFactClick: (target: FactDetailTarget) => void;
  shownCategoryIds?: number[];
}) {
  const factColor = kind === "EXPENSE" ? "rgb(220 38 38)" : "var(--t-secondary)";
  const displayCells = (cells ?? periods.map(() => ({ plan: 0, fact: 0, deviation: 0 } as BudgetCell))).slice(0, rangeCount);

  return (
    <tr>
      <td
        className="text-[12px] py-1.5 pl-3 italic"
        style={{ color: "var(--t-faint)", background: "var(--bgt-row-bg)", borderRight: "2px solid var(--bgt-sticky-border)" }}
      >
        {label}
      </td>
      {displayCells.map((cell, i) => {
        const pk = getPeriodKind(periods[i]);
        const p = periods[i];
        const pBorder = { borderLeft: "2px solid var(--bgt-cell-border-strong)" } as React.CSSProperties;
        const factEl = cell.fact
          ? <span onClick={() => onFactClick({ categoryId: -1, categoryTitle: label, kind, periodLabel: p.label, dateFrom: p.range_start, dateTo: p.range_end, factAmount: cell.fact, excludeCategoryIds: shownCategoryIds })} className="cursor-pointer hover:underline hover:text-indigo-600" style={{ color: factColor }}>{fmt(cell.fact)}</span>
          : <span style={{ color: "var(--bgt-dash)" }}>—</span>;

        if (pk === "past") return (
          <React.Fragment key={i}>
            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={pBorder}>{factEl}</td>
            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)" }}>—</td>
          </React.Fragment>
        );
        if (pk === "current") return (
          <React.Fragment key={i}>
            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)", ...pBorder }}>—</td>
            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]">{factEl}</td>
            <td className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)" }}>—</td>
          </React.Fragment>
        );
        return <td key={i} className="tabular-nums text-right px-2 py-1.5 text-[12px]" style={{ color: "var(--bgt-dash)", ...pBorder }}>—</td>;
      })}
      <td className="tabular-nums text-right px-2 py-1.5 text-[12px] bgt-tc-plan" style={{ color: "var(--bgt-dash)", borderLeft: "2px solid var(--bgt-sticky-border)", background: "var(--bgt-row-bg)" }}>—</td>
      <td className="tabular-nums text-right px-2 py-1.5 text-[12px] bgt-tc-fact" style={{ color: total?.fact ? factColor : "var(--bgt-dash)", background: "var(--bgt-row-bg)" }}>
        {total?.fact ? fmt(total.fact) : "—"}
      </td>
    </tr>
  );
}

// ── Mobile view components ───────────────────────────────────────────────────

function MobileSecHead({ label, expanded, onToggle }: { label: string; expanded: boolean; onToggle: () => void }) {
  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2.5 cursor-pointer select-none border-b"
      onClick={onToggle}
      style={{ background: "var(--bgt-section-bg)", borderColor: "var(--app-border)" }}
    >
      {expanded
        ? <ChevronDown size={12} style={{ color: "var(--t-muted)" }} />
        : <ChevronRightSm size={12} style={{ color: "var(--t-muted)" }} />}
      <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: "var(--t-muted)" }}>{label}</span>
    </div>
  );
}

function MobileCatRow({ row, focusPeriod, focusIdx, editing, kind }: {
  row: BudgetRow;
  focusPeriod: BudgetPeriod | undefined;
  focusIdx: number;
  editing: EditingProps;
  kind: "income" | "expense";
}) {
  const cell = row.cells[focusIdx] ?? { plan: 0, fact: 0, deviation: 0, note: null };
  const canEdit = !!focusPeriod?.has_manual_plan && !!row.category_id && !row.is_group;
  const key = `cat:${row.category_id}:${row.kind}:${focusPeriod?.year}:${focusPeriod?.month}`;
  const isEditing = editing.activeEditKey === key;
  const isGroup = row.is_group || row.parent_id === null;
  const hasPlan = cell.plan !== 0;
  const hasFact = cell.fact !== 0;
  const pk = focusPeriod ? getPeriodKind(focusPeriod) : "current";

  let factColor = "var(--t-primary)";
  if (hasFact && hasPlan) {
    const isGood = (kind === "income" && cell.fact >= cell.plan) || (kind === "expense" && cell.fact <= cell.plan);
    factColor = isGood ? "rgb(22 163 74)" : "rgb(220 38 38)";
  }

  const pct = hasPlan && pk !== "future" ? cell.fact / cell.plan : null;
  const barColor = kind === "expense"
    ? (pct !== null && pct > 1 ? "rgb(220 38 38)" : pct !== null && pct > 0.85 ? "rgb(251 146 60)" : "rgb(99 102 241)")
    : "rgb(52 211 153)";

  const planTarget: PlanEditTarget = {
    categoryId: row.category_id!,
    kind: row.kind,
    year: focusPeriod?.year ?? 0,
    month: focusPeriod?.month ?? 0,
    periodLabel: focusPeriod?.label ?? "",
    categoryTitle: row.title,
    currentAmount: cell.plan,
    currentNote: cell.note ?? "",
  };

  return (
    <div
      className={clsx("flex items-center gap-3 border-b", row.depth > 0 ? "pl-8" : "pl-4", "pr-4 py-2.5")}
      style={{ borderColor: "var(--app-border)", background: isGroup ? "var(--bgt-row-group)" : "var(--bgt-row-bg)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 min-w-0">
          {row.depth > 0 && <span className="text-[10px] shrink-0" style={{ color: "var(--t-faint)" }}>└</span>}
          <span
            className={clsx(
              "text-[13px] truncate",
              isGroup ? "font-bold" : "font-normal",
              editing.hiddenCatIds?.has(row.category_id!) ? "opacity-40 line-through" : ""
            )}
            style={{ color: "var(--t-primary)" }}
          >
            {row.title}
          </span>
          {!!cell.note && (
            <span
              className="text-amber-400 text-[9px] ml-0.5 font-bold shrink-0 cursor-pointer"
              title={`📝 ${cell.note}`}
              onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(planTarget); }}
            >●</span>
          )}
        </div>
        {pct !== null && (
          <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 100, 100)}%`, background: barColor }} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0" style={{ width: 60 }}>
        {canEdit && (
          <button
            type="button"
            className="opacity-40 hover:opacity-100 transition-opacity hover:text-indigo-400 shrink-0"
            style={{ color: "var(--t-faint)", visibility: isEditing ? "hidden" : "visible" }}
            title="С комментарием"
            onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(planTarget); }}
          >
            <Pencil size={10} />
          </button>
        )}
        <div
          className="tabular-nums text-right text-[12px]"
          style={{ color: "var(--t-muted)", cursor: canEdit ? "pointer" : "default" }}
          onClick={canEdit && !isEditing ? () => editing.onInlineStart(key, cell.plan) : undefined}
        >
          {isEditing ? (
            <InlineCellInput
              value={editing.inlineValue}
              onChange={editing.onInlineChange}
              onSave={() => editing.onInlineSave(planTarget)}
              onCancel={editing.onInlineCancel}
            />
          ) : (
            hasPlan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")
          )}
        </div>
      </div>
      <div
        className="tabular-nums text-right text-[13px] font-medium shrink-0"
        style={{ width: 60, color: hasFact ? factColor : "var(--bgt-dash)", cursor: hasFact && row.category_id ? "pointer" : "default" }}
        onClick={hasFact && row.category_id && focusPeriod ? () => editing.openFactDetail({
          categoryId: row.category_id!,
          categoryTitle: row.title,
          kind: row.kind,
          periodLabel: focusPeriod.label,
          dateFrom: focusPeriod.range_start,
          dateTo: focusPeriod.range_end,
          factAmount: cell.fact,
        }) : undefined}
      >
        {hasFact ? fmt(cell.fact) : "—"}
      </div>
    </div>
  );
}

function MobileGoalRow({ row, focusPeriod, focusIdx, editing, kind, goalPlanType }: {
  row: BudgetGoalRow;
  focusPeriod: BudgetPeriod | undefined;
  focusIdx: number;
  editing: EditingProps;
  kind: "income" | "expense";
  goalPlanType: string;
}) {
  const cell = row.cells[focusIdx] ?? { plan: 0, fact: 0, deviation: 0, note: null };
  const canEdit = !!focusPeriod?.has_manual_plan;
  const key = `goal:${row.goal_id}:${goalPlanType}:${focusPeriod?.year}:${focusPeriod?.month}`;
  const isEditing = editing.activeEditKey === key;
  const pk = focusPeriod ? getPeriodKind(focusPeriod) : "current";
  const hasPlan = cell.plan !== 0;
  const hasFact = cell.fact !== 0;

  let factColor = "var(--t-primary)";
  if (hasFact && hasPlan) {
    const isGood = (kind === "income" && cell.fact >= cell.plan) || (kind === "expense" && cell.fact <= cell.plan);
    factColor = isGood ? "rgb(22 163 74)" : "rgb(220 38 38)";
  }

  const pct = hasPlan && pk !== "future" ? cell.fact / cell.plan : null;
  const barColor = kind === "expense"
    ? (pct !== null && pct > 1 ? "rgb(220 38 38)" : pct !== null && pct > 0.85 ? "rgb(251 146 60)" : "rgb(99 102 241)")
    : "rgb(52 211 153)";

  const target: PlanEditTarget = {
    categoryId: 0,
    kind: kind === "income" ? "INCOME" : "EXPENSE",
    year: focusPeriod?.year ?? 0,
    month: focusPeriod?.month ?? 0,
    periodLabel: focusPeriod?.label ?? "",
    categoryTitle: row.title,
    currentAmount: cell.plan,
    currentNote: cell.note ?? "",
    goalId: row.goal_id,
    goalPlanType,
  };

  return (
    <div
      className="flex items-center gap-3 pl-4 pr-4 py-2.5 border-b"
      style={{ borderColor: "var(--app-border)", background: "var(--bgt-row-bg)" }}
    >
      <div className="flex-1 min-w-0">
        <span className="text-[13px] truncate block font-normal" style={{ color: "var(--t-secondary)" }}>{row.title}</span>
        {pct !== null && (
          <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct * 100, 100)}%`, background: barColor }} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-1 shrink-0" style={{ width: 60 }}>
        {canEdit && (
          <button
            type="button"
            className="opacity-40 hover:opacity-100 transition-opacity hover:text-indigo-400 shrink-0"
            style={{ color: "var(--t-faint)", visibility: isEditing ? "hidden" : "visible" }}
            title="С комментарием"
            onClick={(e) => { e.stopPropagation(); editing.openPlanEdit(target); }}
          >
            <Pencil size={10} />
          </button>
        )}
        <div
          className="tabular-nums text-right text-[12px]"
          style={{ color: "var(--t-muted)", cursor: canEdit ? "pointer" : "default" }}
          onClick={canEdit && !isEditing ? () => editing.onInlineStart(key, cell.plan) : undefined}
        >
          {isEditing ? (
            <InlineCellInput
              value={editing.inlineValue}
              onChange={editing.onInlineChange}
              onSave={() => editing.onInlineSave(target)}
              onCancel={editing.onInlineCancel}
            />
          ) : (
            hasPlan ? fmt(cell.plan) : (canEdit ? <span style={{ opacity: 0.3 }}>—</span> : "—")
          )}
        </div>
      </div>
      <div
        className="tabular-nums text-right text-[13px] font-medium shrink-0"
        style={{ width: 60, color: hasFact ? factColor : "var(--bgt-dash)" }}
      >
        {hasFact ? fmt(cell.fact) : "—"}
      </div>
    </div>
  );
}

function MobileTotRow({ label, totals, kind }: {
  label: string;
  totals: BudgetSectionTotals;
  kind: "income" | "expense" | "neutral";
}) {
  const total = totals.total;
  const hasFact = total.fact !== 0;
  const hasPlan = total.plan !== 0;
  const factColor = hasFact && hasPlan
    ? ((kind === "income" && total.fact >= total.plan) || (kind === "expense" && total.fact <= total.plan)
      ? "rgb(22 163 74)" : "rgb(220 38 38)")
    : "var(--t-primary)";

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 border-b"
      style={{ borderColor: "var(--app-border)", borderTop: "2px solid var(--app-accent)", background: "var(--bgt-totals-bg)" }}
    >
      <div className="flex-1 text-[12px] font-extrabold" style={{ color: "var(--app-accent-ink)" }}>{label}</div>
      <div className="tabular-nums text-right text-[12px] font-semibold shrink-0" style={{ width: 60, color: "var(--t-secondary)" }}>
        {hasPlan ? fmt(total.plan) : "—"}
      </div>
      <div className="tabular-nums text-right text-[13px] font-bold shrink-0" style={{ width: 60, color: hasFact ? factColor : "var(--bgt-dash)" }}>
        {hasFact ? fmt(total.fact) : "—"}
      </div>
    </div>
  );
}

function MobileOtherRow({ label, kind, cells, focusPeriod, focusIdx, onFactClick, shownCategoryIds }: {
  label: string;
  kind: "INCOME" | "EXPENSE";
  cells?: BudgetCell[];
  focusPeriod: BudgetPeriod | undefined;
  focusIdx: number;
  onFactClick: (target: FactDetailTarget) => void;
  shownCategoryIds?: number[];
}) {
  const cell = cells?.[focusIdx] ?? { plan: 0, fact: 0, deviation: 0 };
  const factColor = kind === "EXPENSE" ? "rgb(220 38 38)" : "var(--t-secondary)";
  const hasFact = cell.fact !== 0;

  return (
    <div
      className="flex items-center gap-3 pl-4 pr-4 py-2.5 border-b italic"
      style={{ borderColor: "var(--app-border)", background: "var(--bgt-row-bg)" }}
    >
      <div className="flex-1 text-[13px] truncate" style={{ color: "var(--t-faint)" }}>{label}</div>
      <div className="tabular-nums text-right text-[12px] shrink-0" style={{ width: 60, color: "var(--bgt-dash)" }}>—</div>
      <div
        className="tabular-nums text-right text-[13px] font-medium shrink-0"
        style={{ width: 60, color: hasFact ? factColor : "var(--bgt-dash)", cursor: hasFact ? "pointer" : "default" }}
        onClick={hasFact && focusPeriod ? () => onFactClick({
          categoryId: -1,
          categoryTitle: label,
          kind,
          periodLabel: focusPeriod.label,
          dateFrom: focusPeriod.range_start,
          dateTo: focusPeriod.range_end,
          factAmount: cell.fact,
          excludeCategoryIds: shownCategoryIds,
        }) : undefined}
      >
        {hasFact ? fmt(cell.fact) : "—"}
      </div>
    </div>
  );
}

function MobileResultRow({ result }: { result: BudgetMatrix["result"] }) {
  const total = result.total;
  const planColor = total.plan >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";
  const factColor = total.fact >= 0 ? "rgb(52 211 153)" : "rgb(248 113 113)";

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ background: "var(--app-sidebar-bg)", borderTop: "2px solid var(--app-border)" }}
    >
      <div className="flex-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t-primary)" }}>
        Результат
      </div>
      <div className="tabular-nums text-right text-[13px] font-semibold shrink-0" style={{ width: 60, color: planColor }}>
        {fmtSigned(total.plan)}
      </div>
      <div className="tabular-nums text-right text-[13px] font-semibold shrink-0" style={{ width: 60, color: factColor }}>
        {fmtSigned(total.fact)}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BudgetMatrixPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rangeCount, setRangeCount] = useState(4);

  // Mobile default: 2 periods on narrow screens
  React.useEffect(() => {
    if (window.innerWidth < 640) setRangeCount(2);
  }, []);

  // Section collapse — persisted in localStorage
  const [sections, setSectionsState] = useState<{ incomeOpen: boolean; expenseOpen: boolean; goalsOpen: boolean; withdrawOpen: boolean }>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("bgt_sections") || "{}");
      return { incomeOpen: s.incomeOpen ?? true, expenseOpen: s.expenseOpen ?? true, goalsOpen: s.goalsOpen ?? true, withdrawOpen: s.withdrawOpen ?? true };
    } catch { return { incomeOpen: true, expenseOpen: true, goalsOpen: true, withdrawOpen: true }; }
  });

  function setSections(updater: (prev: typeof sections) => typeof sections) {
    setSectionsState(prev => {
      const next = updater(prev);
      try { localStorage.setItem("bgt_sections", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const { incomeOpen, expenseOpen, goalsOpen, withdrawOpen } = sections;
  const setIncomeOpen  = (v: boolean) => setSections(p => ({ ...p, incomeOpen: v }));
  const setExpenseOpen = (v: boolean) => setSections(p => ({ ...p, expenseOpen: v }));
  const setGoalsOpen   = (v: boolean) => setSections(p => ({ ...p, goalsOpen: v }));
  const setWithdrawOpen= (v: boolean) => setSections(p => ({ ...p, withdrawOpen: v }));

  const [planEditTarget, setPlanEditTarget] = useState<PlanEditTarget | null>(null);
  const [factDetailTarget, setFactDetailTarget] = useState<FactDetailTarget | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  // Inline editing
  const [activeEditKey, setActiveEditKey] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState("");

  function handleInlineStart(key: string, currentValue: number, initialStr?: string) {
    setActiveEditKey(key);
    setInlineValue(initialStr !== undefined ? initialStr : (currentValue ? String(Math.round(currentValue)) : ""));
  }

  async function handleInlineSave(target: PlanEditTarget) {
    const val = inlineValue;
    setActiveEditKey(null);
    setInlineValue("");
    await savePlan(target, val, target.currentNote, false);
  }

  function handleInlineCancel() {
    setActiveEditKey(null);
    setInlineValue("");
  }

  // ── Drag-and-drop reorder state ──
  const dragSrc = useRef<{ catId: number; parentId: number | null } | null>(null);
  const [dragOver, setDragOver] = useState<{ id: number; pos: "before" | "after" | "invalid" | "end" } | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, catId: number, parentId: number | null) => {
    dragSrc.current = { catId, parentId };
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, catId: number, parentId: number | null) => {
    if (!dragSrc.current || dragSrc.current.catId === catId) return;
    e.preventDefault();
    if (dragSrc.current.parentId !== parentId) {
      e.dataTransfer.dropEffect = "none";
      setDragOver({ id: catId, pos: "invalid" });
      return;
    }
    e.dataTransfer.dropEffect = "move";
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? "before" : "after";
    setDragOver({ id: catId, pos });
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(null);
    }
  }, []);

  const onDragEnd = useCallback((_e: React.DragEvent) => {
    setDragOver(null);
    dragSrc.current = null;
  }, []);

  async function handleDrop(e: React.DragEvent, targetCatId: number, rows: BudgetRow[]) {
    e.preventDefault();
    const pos = dragOver?.pos;
    setDragOver(null);
    if (!dragSrc.current || dragSrc.current.catId === targetCatId) return;
    if (pos === "invalid") { dragSrc.current = null; return; }

    const srcId = dragSrc.current.catId;
    const srcParentId = dragSrc.current.parentId;
    dragSrc.current = null;

    const tgtRow = rows.find(r => r.category_id === targetCatId);
    if (!tgtRow || tgtRow.parent_id !== srcParentId) return;

    const siblings = rows.filter(r => r.category_id && r.parent_id === srcParentId);
    const ids = siblings.map(r => r.category_id!);
    const srcIdx = ids.indexOf(srcId);
    if (srcIdx < 0) return;

    ids.splice(srcIdx, 1);
    let insertIdx = ids.indexOf(targetCatId);
    if (insertIdx < 0) return;
    if (pos === "after") insertIdx += 1;
    ids.splice(insertIdx, 0, srcId);

    const items = ids.map((id, i) => ({ category_id: id, sort_order: i }));
    await api.post("/api/v2/categories/reorder", { items });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  async function handleDropEnd(rows: BudgetRow[]) {
    setDragOver(null);
    if (!dragSrc.current) return;
    const srcId = dragSrc.current.catId;
    const parentId = dragSrc.current.parentId;
    dragSrc.current = null;

    const siblings = rows.filter(r => r.category_id && r.parent_id === parentId);
    const ids = siblings.map(r => r.category_id!);
    const srcIdx = ids.indexOf(srcId);
    if (srcIdx < 0) return;

    ids.splice(srcIdx, 1);
    ids.push(srcId);

    const items = ids.map((id, i) => ({ category_id: id, sort_order: i }));
    await api.post("/api/v2/categories/reorder", { items });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  const qc = useQueryClient();

  // ── Goal drag-and-drop (withdrawal + savings sections) ──
  const dragSrcGoal = useRef<number | null>(null);
  const [dragOverGoal, setDragOverGoal] = useState<{ id: number; pos: "before" | "after" } | null>(null);

  const onGoalDragStart = useCallback((e: React.DragEvent, goalId: number) => {
    dragSrcGoal.current = goalId;
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onGoalDragOver = useCallback((e: React.DragEvent, goalId: number) => {
    if (!dragSrcGoal.current || dragSrcGoal.current === goalId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? "before" : "after";
    setDragOverGoal({ id: goalId, pos });
  }, []);

  const onGoalDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGoal(null);
  }, []);

  const onGoalDragEnd = useCallback((_e: React.DragEvent) => {
    setDragOverGoal(null);
    dragSrcGoal.current = null;
  }, []);

  async function handleGoalDrop(e: React.DragEvent, targetGoalId: number, rows: BudgetGoalRow[]) {
    e.preventDefault();
    const pos = dragOverGoal?.pos;
    setDragOverGoal(null);
    if (!dragSrcGoal.current || dragSrcGoal.current === targetGoalId) return;
    const srcId = dragSrcGoal.current;
    dragSrcGoal.current = null;

    const ids = rows.map(r => r.goal_id);
    const srcIdx = ids.indexOf(srcId);
    if (srcIdx < 0) return;
    ids.splice(srcIdx, 1);
    let insertIdx = ids.indexOf(targetGoalId);
    if (insertIdx < 0) return;
    if (pos === "after") insertIdx += 1;
    ids.splice(insertIdx, 0, srcId);

    const items = ids.map((id, i) => ({ goal_id: id, sort_order: i }));
    await api.patch("/api/v2/goals/reorder", items);
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

  async function handleGoalDropEnd(rows: BudgetGoalRow[]) {
    setDragOverGoal(null);
    if (!dragSrcGoal.current) return;
    const srcId = dragSrcGoal.current;
    dragSrcGoal.current = null;
    const ids = rows.map(r => r.goal_id);
    const srcIdx = ids.indexOf(srcId);
    if (srcIdx < 0) return;
    ids.splice(srcIdx, 1);
    ids.push(srcId);
    const items = ids.map((id, i) => ({ goal_id: id, sort_order: i }));
    await api.patch("/api/v2/goals/reorder", items);
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
  }

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

  // ── CSV export ──

  function downloadCSV() {
    if (!data) return;
    const ps = periods;
    const hdr = ["Категория", ...ps.flatMap(p => {
      const k = getPeriodKind(p);
      const lbl = multiYear ? `${p.short_label}'${String(p.year).slice(2)}` : p.short_label;
      if (k === "past") return [`${lbl} Ф`, `${lbl} Δ`];
      if (k === "current") return [`${lbl} П`, `${lbl} Ф`, `${lbl} Ост`];
      return [`${lbl} П`];
    }), "Итого П", "Итого Ф"];

    const rowToCsv = (title: string, cells: BudgetCell[], total: BudgetCell) =>
      [title, ...cells.slice(0, rangeCount).flatMap((c, i) => {
        const k = getPeriodKind(ps[i]);
        if (k === "past") return [fmt(c.fact), fmtSigned(c.deviation)];
        if (k === "current") return [fmt(c.plan), fmt(c.fact), fmt(c.plan - c.fact)];
        return [fmt(c.plan)];
      }), fmt(total.plan), fmt(total.fact)];

    const rows: string[][] = [hdr];
    rows.push(["ДОХОДЫ"]);
    data.income_rows.forEach(r => rows.push(rowToCsv(r.title, r.cells, r.total)));
    rows.push(["ВЗЯТЬ ИЗ ОТЛОЖЕННОГО"]);
    data.withdrawal_rows.forEach(r => rows.push(rowToCsv(r.title, r.cells, r.total)));
    rows.push(["РАСХОДЫ"]);
    data.expense_rows.forEach(r => rows.push(rowToCsv(r.title, r.cells, r.total)));
    rows.push(["ОТЛОЖИТЬ"]);
    data.goal_rows.forEach(r => rows.push(rowToCsv(r.title, r.cells, r.total)));

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `budget_${year}_${String(month).padStart(2,"0")}_${rangeCount}m.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Tab navigation (needs data) ──

  const editableKeys = React.useMemo(() => {
    if (!data) return [];
    const ps = data.periods;
    const keys: string[] = [];
    if (incomeOpen) {
      for (const row of data.income_rows) {
        if (!row.category_id || row.is_group) continue;
        ps.forEach(p => { if (p.has_manual_plan) keys.push(`cat:${row.category_id}:${row.kind}:${p.year}:${p.month}`); });
      }
    }
    if (withdrawOpen) {
      for (const row of data.withdrawal_rows) {
        ps.forEach(p => { if (p.has_manual_plan) keys.push(`goal:${row.goal_id}:withdrawal:${p.year}:${p.month}`); });
      }
    }
    if (expenseOpen) {
      for (const row of data.expense_rows) {
        if (!row.category_id || row.is_group) continue;
        ps.forEach(p => { if (p.has_manual_plan) keys.push(`cat:${row.category_id}:${row.kind}:${p.year}:${p.month}`); });
      }
    }
    if (goalsOpen) {
      for (const row of data.goal_rows) {
        ps.forEach(p => { if (p.has_manual_plan) keys.push(`goal:${row.goal_id}:goal:${p.year}:${p.month}`); });
      }
    }
    return keys;
  }, [data, incomeOpen, expenseOpen, goalsOpen, withdrawOpen]);

  function getEditableValue(key: string): string {
    if (!data) return "";
    const parts = key.split(":");
    let plan = 0;
    if (parts[0] === "cat") {
      const catId = parseInt(parts[1]);
      const kind = parts[2];
      const yr = parseInt(parts[3]);
      const mo = parseInt(parts[4]);
      for (const rows of [data.income_rows, data.expense_rows]) {
        const row = rows.find(r => r.category_id === catId && r.kind === kind);
        if (row) {
          const pi = data.periods.findIndex(p => p.year === yr && p.month === mo);
          if (pi >= 0) plan = row.cells[pi]?.plan ?? 0;
          break;
        }
      }
    } else {
      const goalId = parseInt(parts[1]);
      const yr = parseInt(parts[3]);
      const mo = parseInt(parts[4]);
      for (const row of [...data.goal_rows, ...data.withdrawal_rows]) {
        if (row.goal_id === goalId) {
          const pi = data.periods.findIndex(p => p.year === yr && p.month === mo);
          if (pi >= 0) plan = row.cells[pi]?.plan ?? 0;
          break;
        }
      }
    }
    return plan ? String(Math.round(plan)) : "";
  }

  function handleTabNav(dir: "next" | "prev", fromKey: string, savedTarget: PlanEditTarget) {
    const val = inlineValue;
    setActiveEditKey(null);
    setInlineValue("");
    savePlan(savedTarget, val, savedTarget.currentNote, false);
    const idx = editableKeys.indexOf(fromKey);
    if (idx < 0) return;
    const nextIdx = dir === "next" ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= editableKeys.length) return;
    const nextKey = editableKeys[nextIdx];
    setActiveEditKey(nextKey);
    setInlineValue(getEditableValue(nextKey));
  }

  const periods = data?.periods ?? [];

  // Focus period for mobile view: prefer current, then last past, then first period
  const focusIdx = React.useMemo(() => {
    const ci = periods.findIndex(p => getPeriodKind(p) === "current");
    if (ci >= 0) return ci;
    for (let i = periods.length - 1; i >= 0; i--) {
      if (getPeriodKind(periods[i]) === "past") return i;
    }
    return 0;
  }, [periods]);
  const focusPeriod = periods[focusIdx];

  const multiYear = periods.length > 1 && periods.some(p => p.year !== periods[0].year);
  const fmtPeriodLabel = (p: BudgetPeriod) => multiYear ? `${p.short_label} '${String(p.year).slice(2)}` : p.short_label;
  const periodLabel = periods.length > 0
    ? `${fmtPeriodLabel(periods[0])} — ${fmtPeriodLabel(periods[periods.length - 1])}`
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
    dragHandlers: { onDragStart, onDragOver, onDragLeave, onDragEnd, dragOver },
    toggleVisibility: showHidden ? toggleVisibility : undefined,
    hiddenCatIds: showHidden ? hiddenCatIds : undefined,
    showHidden,
    activeEditKey,
    inlineValue,
    onInlineStart: handleInlineStart,
    onInlineChange: setInlineValue,
    onInlineSave: handleInlineSave,
    onInlineCancel: handleInlineCancel,
    onTabNav: handleTabNav,
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
      <PageHeader
        title="Расширенный бюджет"
        density="compact"
        sticky
        period={
          <div className="flex items-center gap-1">
            <Tooltip content="Назад">
              <button
                onClick={goBack}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
                style={{ color: "var(--t-secondary)" }}
              >
                <ChevronLeft size={16} />
              </button>
            </Tooltip>
            <PeriodPicker
              value={{ year, month, rangeCount }}
              onChange={({ year: y, month: m, rangeCount: rc }) => { setYear(y); setMonth(m); setRangeCount(rc); }}
              label={periodLabel}
            />
            <Tooltip content="Вперёд">
              <button
                onClick={goForward}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
                style={{ color: "var(--t-secondary)" }}
              >
                <ChevronRight size={16} />
              </button>
            </Tooltip>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              CSV
            </button>
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
        }
      />

      <main className="flex-1 flex flex-col overflow-hidden">

        {/* ── MOBILE VIEW ── */}
        <div className="md:hidden flex-1 min-h-0 overflow-auto" style={{ background: "var(--app-bg)" }}>
          {isPending && (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={48} className="rounded-xl" />
              ))}
            </div>
          )}
          {isError && (
            <p className="text-red-400/70 text-sm text-center py-16">
              Не удалось загрузить матрицу бюджета
            </p>
          )}
          {data && (
            <>
              {/* Column header bar */}
              <div
                className="flex items-center gap-3 px-4 py-2 border-b sticky top-0 z-20"
                style={{ background: "var(--bgt-head-bg)", borderColor: "var(--app-border)" }}
              >
                <div className="flex-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
                  {focusPeriod ? fmtPeriodLabel(focusPeriod) : ""}
                </div>
                <div className="text-[10px] font-bold uppercase text-right shrink-0" style={{ width: 60, color: "var(--t-faint)" }}>П</div>
                <div className="text-[10px] font-bold uppercase text-right shrink-0" style={{ width: 60, color: "var(--t-faint)" }}>Ф</div>
              </div>

              {/* ДОХОДЫ */}
              <MobileSecHead label="Доходы" expanded={incomeOpen} onToggle={() => setIncomeOpen(!incomeOpen)} />
              {incomeOpen && <>
                {data.income_rows.map((row, i) => (
                  <MobileCatRow
                    key={row.category_id ?? `m-inc-${i}`}
                    row={row}
                    focusPeriod={focusPeriod}
                    focusIdx={focusIdx}
                    editing={editingProps}
                    kind="income"
                  />
                ))}
                <MobileOtherRow
                  label="Прочие доходы"
                  kind="INCOME"
                  cells={data.other_income?.cells as BudgetCell[] | undefined}
                  focusPeriod={focusPeriod}
                  focusIdx={focusIdx}
                  onFactClick={setFactDetailTarget}
                  shownCategoryIds={data.income_rows.map((r) => r.category_id).filter((id): id is number => id != null)}
                />
              </>}
              <MobileTotRow label="Итого доходы" totals={data.income_totals} kind="income" />

              {/* ВЗЯТЬ ИЗ ОТЛОЖЕННОГО */}
              {data.withdrawal_rows.length > 0 && <>
                <MobileSecHead label="Взять из отложенного" expanded={withdrawOpen} onToggle={() => setWithdrawOpen(!withdrawOpen)} />
                {withdrawOpen && data.withdrawal_rows.map((row, i) => (
                  <MobileGoalRow
                    key={row.goal_id ?? `m-wd-${i}`}
                    row={row}
                    focusPeriod={focusPeriod}
                    focusIdx={focusIdx}
                    editing={editingProps}
                    kind="income"
                    goalPlanType="withdrawal"
                  />
                ))}
                <MobileTotRow label="Итого взять" totals={data.withdrawal_totals} kind="income" />
              </>}

              {/* РАСХОДЫ */}
              <MobileSecHead label="Расходы" expanded={expenseOpen} onToggle={() => setExpenseOpen(!expenseOpen)} />
              {expenseOpen && <>
                {data.expense_rows.map((row, i) => (
                  <MobileCatRow
                    key={row.category_id ?? `m-exp-${i}`}
                    row={row}
                    focusPeriod={focusPeriod}
                    focusIdx={focusIdx}
                    editing={editingProps}
                    kind="expense"
                  />
                ))}
                <MobileOtherRow
                  label="Прочие расходы"
                  kind="EXPENSE"
                  cells={data.other_expense?.cells as BudgetCell[] | undefined}
                  focusPeriod={focusPeriod}
                  focusIdx={focusIdx}
                  onFactClick={setFactDetailTarget}
                  shownCategoryIds={data.expense_rows.map((r) => r.category_id).filter((id): id is number => id != null)}
                />
              </>}
              <MobileTotRow label="Итого расходы" totals={data.expense_totals} kind="expense" />

              {/* ОТЛОЖИТЬ */}
              {data.goal_rows.length > 0 && <>
                <MobileSecHead label="Отложить" expanded={goalsOpen} onToggle={() => setGoalsOpen(!goalsOpen)} />
                {goalsOpen && data.goal_rows.map((row, i) => (
                  <MobileGoalRow
                    key={row.goal_id ?? `m-goal-${i}`}
                    row={row}
                    focusPeriod={focusPeriod}
                    focusIdx={focusIdx}
                    editing={editingProps}
                    kind="expense"
                    goalPlanType="goal"
                  />
                ))}
                <MobileTotRow label="Итого отложить" totals={data.goal_totals} kind="expense" />
              </>}

              {/* РЕЗУЛЬТАТ */}
              <MobileResultRow result={data.result} />
            </>
          )}
        </div>

        {/* ── DESKTOP TABLE ── */}
        <div className="hidden md:flex flex-1 flex-col overflow-hidden">

        {/* Table area — this div is the scroll container, sticky works inside it */}
        <div className="flex-1 overflow-auto relative">
          {isPending && (
            <div className="p-6 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={32} className="rounded" />
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
                .bgt-matrix td, .bgt-matrix th { border: 1px solid var(--bgt-cell-border); }
                .bgt-matrix td { font-size: 13px; padding: 3px 7px; color: var(--t-primary); }
                .bgt-matrix td:first-child { border-right: 2px solid var(--bgt-sticky-border) !important; background: var(--bgt-row-bg); position: sticky; left: 0; z-index: 5; font-size: 12px; }
                .bgt-matrix tr:hover td { background-color: var(--bgt-hover-bg) !important; }
                .bgt-matrix thead { position: sticky; top: 0; z-index: 20; }
                .bgt-matrix thead th { background: var(--bgt-head-bg); }
                .bgt-matrix tr[data-drag-over="true"] td:first-child { border-top: 3px solid var(--app-accent) !important; }
                .bgt-matrix .bgt-tc-plan { position: sticky; right: 80px; z-index: 6; min-width: 80px; }
                .bgt-matrix .bgt-tc-fact { position: sticky; right: 0; z-index: 6; min-width: 80px; }
                .bgt-matrix .bgt-th-plan { position: sticky; right: 80px; z-index: 25; min-width: 80px; background: var(--bgt-head-bg); }
                .bgt-matrix .bgt-th-fact { position: sticky; right: 0; z-index: 25; min-width: 80px; background: var(--bgt-head-bg); }
                .bgt-matrix tr:hover .bgt-tc-plan, .bgt-matrix tr:hover .bgt-tc-fact { background-color: var(--bgt-hover-bg) !important; }
              `}</style>
              <table className="bgt-matrix w-full text-left" style={{ border: "1px solid var(--bgt-cell-border-strong)", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  {/* Period headers */}
                  <tr style={{ background: "var(--bgt-head-bg)" }}>
                    <th
                      className="text-[11px] font-bold uppercase tracking-wider px-3 py-2 sticky left-0 z-30 min-w-[180px]"
                      style={{ background: "var(--bgt-head-bg)", color: "var(--t-muted)", border: "1px solid var(--bgt-cell-border-strong)" }}
                    >
                      Категория
                    </th>
                    <PeriodHeaders periods={periods} />
                  </tr>
                  {/* P / F sub-headers */}
                  <tr style={{ background: "var(--bgt-subhead-bg)" }}>
                    <th
                      className="sticky left-0 z-30"
                      style={{ background: "var(--bgt-head-bg)", border: "1px solid var(--bgt-cell-border-strong)" }}
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
                    onToggle={() => setIncomeOpen(!incomeOpen)}
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
                  {incomeOpen && (
                    <tr
                      onDragOver={(e) => { if (!dragSrc.current) return; e.preventDefault(); setDragOver({ id: -1, pos: "end" }); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                      onDrop={(e) => { e.preventDefault(); handleDropEnd(data.income_rows); }}
                    >
                      <td colSpan={totalCols} style={{ height: 10, background: dragOver?.id === -1 ? "rgba(99,102,241,0.15)" : undefined, transition: "background 0.15s" }} />
                    </tr>
                  )}
                  {/* Прочие доходы — always visible */}
                  {incomeOpen && (
                    <OtherRow
                      label="Прочие доходы"
                      kind="INCOME"
                      cells={data.other_income?.cells as BudgetCell[] | undefined}
                      total={data.other_income?.total as BudgetCell | undefined}
                      periods={periods}
                      rangeCount={rangeCount}
                      onFactClick={setFactDetailTarget}
                      shownCategoryIds={data.income_rows.map((r) => r.category_id).filter((id): id is number => id != null)}
                    />
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
                        onToggle={() => setWithdrawOpen(!withdrawOpen)}
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
                          onDragStart={(e) => onGoalDragStart(e, row.goal_id)}
                          onDragOver={(e) => onGoalDragOver(e, row.goal_id)}
                          onDragLeave={onGoalDragLeave}
                          onDragEnd={onGoalDragEnd}
                          onDrop={(e) => handleGoalDrop(e, row.goal_id, data.withdrawal_rows)}
                          dragOverPos={dragOverGoal?.id === row.goal_id ? dragOverGoal.pos : null}
                        />
                      ))}
                      {withdrawOpen && (
                        <tr
                          onDragOver={(e) => { if (!dragSrcGoal.current) return; e.preventDefault(); setDragOverGoal({ id: -1, pos: "after" }); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGoal(null); }}
                          onDrop={(e) => { e.preventDefault(); handleGoalDropEnd(data.withdrawal_rows); }}
                        >
                          <td colSpan={totalCols} style={{ height: 10, background: dragOverGoal?.id === -1 ? "rgba(99,102,241,0.15)" : undefined, transition: "background 0.15s" }} />
                        </tr>
                      )}
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
                    onToggle={() => setExpenseOpen(!expenseOpen)}
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
                  {expenseOpen && (
                    <tr
                      onDragOver={(e) => { if (!dragSrc.current) return; e.preventDefault(); setDragOver({ id: -1, pos: "end" }); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                      onDrop={(e) => { e.preventDefault(); handleDropEnd(data.expense_rows); }}
                    >
                      <td colSpan={totalCols} style={{ height: 10, background: dragOver?.id === -1 ? "rgba(99,102,241,0.15)" : undefined, transition: "background 0.15s" }} />
                    </tr>
                  )}
                  {/* Прочие расходы — always visible, clickable */}
                  {expenseOpen && (
                    <OtherRow
                      label="Прочие расходы"
                      kind="EXPENSE"
                      cells={data.other_expense?.cells as BudgetCell[] | undefined}
                      total={data.other_expense?.total as BudgetCell | undefined}
                      periods={periods}
                      rangeCount={rangeCount}
                      onFactClick={setFactDetailTarget}
                      shownCategoryIds={data.expense_rows.map((r) => r.category_id).filter((id): id is number => id != null)}
                    />
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
                        onToggle={() => setGoalsOpen(!goalsOpen)}
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
                          onDragStart={(e) => onGoalDragStart(e, row.goal_id)}
                          onDragOver={(e) => onGoalDragOver(e, row.goal_id)}
                          onDragLeave={onGoalDragLeave}
                          onDragEnd={onGoalDragEnd}
                          onDrop={(e) => handleGoalDrop(e, row.goal_id, data.goal_rows)}
                          dragOverPos={dragOverGoal?.id === row.goal_id ? dragOverGoal.pos : null}
                        />
                      ))}
                      {goalsOpen && (
                        <tr
                          onDragOver={(e) => { if (!dragSrcGoal.current) return; e.preventDefault(); setDragOverGoal({ id: -2, pos: "after" }); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverGoal(null); }}
                          onDrop={(e) => { e.preventDefault(); handleGoalDropEnd(data.goal_rows); }}
                        >
                          <td colSpan={totalCols} style={{ height: 10, background: dragOverGoal?.id === -2 ? "rgba(99,102,241,0.15)" : undefined, transition: "background 0.15s" }} />
                        </tr>
                      )}
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

                  {/* ── ПРОГНОЗ ОСТАТКА ── */}
                  <ForecastRow
                    walletBalance={data.wallet_balance}
                    periodCount={rangeCount}
                    periods={periods}
                    incomeTotals={data.income_totals}
                    expenseTotals={data.expense_totals}
                    withdrawalTotals={data.withdrawal_totals}
                    goalTotals={data.goal_totals}
                  />

                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>{/* end desktop wrapper */}
      </main>
    </>
  );
}
