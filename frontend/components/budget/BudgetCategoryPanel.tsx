"use client";

import { createPortal } from "react-dom";
import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { clsx } from "clsx";

export interface CategoryMonthData {
  year: number;
  month: number;
  label: string;
  fact: number;
  plan: number;
}

export interface BudgetCategoryStats {
  category_id: number;
  title: string;
  kind: "INCOME" | "EXPENSE";
  avg_3m: number;
  avg_6m: number;
  avg_recent: number;
  recent_months: number;
  active_months: number;
  pct_of_total_6m: number;
  trend_pct: number | null;
  plan_accuracy_6m: number | null;
  months: CategoryMonthData[];
}

interface Props {
  stats: BudgetCategoryStats;
  onClose: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function TrendIcon({ pct, kind }: { pct: number | null; kind: "INCOME" | "EXPENSE" }) {
  if (pct === null) return null;
  const isGood = kind === "EXPENSE" ? pct < 0 : pct > 0;
  const Icon = pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const color = isGood ? "#10b981" : "#ef4444";
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-semibold" style={{ color }}>
      <Icon size={13} strokeWidth={2} />
      {Math.abs(pct)}%
    </span>
  );
}

function AccuracyBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>нет плана</span>;
  const color = value >= 80 ? "#10b981" : value >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <span
      className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}22`, color }}
    >
      {value}%
    </span>
  );
}

function MonthBar({ m, maxVal, kind }: { m: CategoryMonthData; maxVal: number; kind: "INCOME" | "EXPENSE" }) {
  const factPct = maxVal > 0 ? Math.min(100, (m.fact / maxVal) * 100) : 0;
  const planPct = m.plan > 0 && maxVal > 0 ? Math.min(100, (m.plan / maxVal) * 100) : 0;
  const over = kind === "EXPENSE" && m.plan > 0 && m.fact > m.plan;
  const under = kind === "EXPENSE" && m.plan > 0 && m.fact < m.plan;
  const aboveInc = kind === "INCOME" && m.plan > 0 && m.fact >= m.plan;

  const factColor = over
    ? "#ef4444"
    : under || aboveInc
    ? "#10b981"
    : kind === "INCOME"
    ? "#10b981"
    : "#6366f1";

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[11px] tabular-nums shrink-0 w-[52px]" style={{ color: "var(--t-faint)" }}>
        {m.label}
      </span>
      <div className="flex-1 relative h-5 flex items-center">
        {/* Plan ghost */}
        {planPct > 0 && (
          <div
            className="absolute left-0 top-1 h-3 rounded-full"
            style={{ width: `${planPct}%`, background: "var(--app-border)", opacity: 0.6 }}
          />
        )}
        {/* Fact */}
        <div
          className="absolute left-0 top-1 h-3 rounded-full transition-all"
          style={{ width: `${factPct}%`, background: factColor }}
        />
      </div>
      <div className="text-right shrink-0 min-w-[64px]">
        <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
          {fmt(m.fact)}
        </span>
        {over && <span className="ml-1 text-[10px] text-red-500">↑</span>}
        {under && <span className="ml-1 text-[10px] text-emerald-500">↓</span>}
      </div>
    </div>
  );
}

export function BudgetCategoryPanel({ stats, onClose }: Props) {
  const maxVal = Math.max(...stats.months.map((m) => Math.max(m.fact, m.plan)), 1);
  const kindLabel = stats.kind === "EXPENSE" ? "Расходы" : "Доходы";

  const panel = (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1" />
      {/* Panel */}
      <div
        className="w-full max-w-sm h-full flex flex-col overflow-hidden shadow-2xl"
        style={{ background: "var(--app-card-bg, var(--app-bg))", borderLeft: "1px solid var(--app-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pb-4 border-b shrink-0"
          style={{ borderColor: "var(--app-border)", paddingTop: "max(16px, env(safe-area-inset-top))" }}
        >
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
              {stats.title}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: "var(--t-faint)" }}>
              {kindLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-secondary)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-slim">
          {/* KPI row */}
          {(() => {
            const recentM = stats.recent_months ?? 3;
            const activeM = stats.active_months ?? 6;
            const avgRecent = stats.avg_recent ?? stats.avg_3m;
            const showBoth = recentM < activeM;
            const kpiItems = showBoth
              ? [
                  { label: `Ср. ${recentM} мес`, value: fmt(avgRecent) + " ₽" },
                  { label: `Ср. ${activeM} мес`, value: fmt(stats.avg_6m) + " ₽" },
                  { label: "% от итого", value: stats.pct_of_total_6m + "%" },
                ]
              : [
                  { label: `Ср. ${activeM} мес`, value: fmt(stats.avg_6m) + " ₽" },
                  { label: "% от итого", value: stats.pct_of_total_6m + "%" },
                ];
            return (
              <div className={`grid gap-3 ${showBoth ? "grid-cols-3" : "grid-cols-2"}`}>
                {kpiItems.map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl p-3 text-center"
                    style={{ background: "var(--app-sidebar-bg)", border: "1px solid var(--app-border)" }}
                  >
                    <p className="text-[10px] mb-1" style={{ color: "var(--t-faint)" }}>
                      {label}
                    </p>
                    <p className="text-[13px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Trend + plan accuracy */}
          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: "var(--app-sidebar-bg)", border: "1px solid var(--app-border)" }}
          >
            <div>
              <p className="text-[11px] mb-1" style={{ color: "var(--t-faint)" }}>
                Тренд (3М vs 6М)
              </p>
              <TrendIcon pct={stats.trend_pct} kind={stats.kind} />
            </div>
            <div className="text-right">
              <p className="text-[11px] mb-1" style={{ color: "var(--t-faint)" }}>
                Точность плана
              </p>
              <AccuracyBadge value={stats.plan_accuracy_6m} />
            </div>
          </div>

          {/* 6-month history */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-faint)" }}>
              История — {stats.months.length} мес
            </p>
            <div className="space-y-0.5">
              {stats.months.map((m) => (
                <MonthBar key={`${m.year}-${m.month}`} m={m} maxVal={maxVal} kind={stats.kind} />
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ background: stats.kind === "INCOME" ? "#10b981" : "#6366f1" }} />
                <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>факт</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ background: "var(--app-border)" }} />
                <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>план</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(panel, document.body);
}
