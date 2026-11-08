"use client";

// Общее для матрицы бюджета: форматирование, типы, мелкие помощники и
// переиспользуемые ячейки. Вынесено из page.tsx — тот разросся до 3000+ строк,
// и любая правка в нём становилась рискованной.

import React from "react";
import type { BudgetPeriod } from "@/types/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function fmt(n: number): string {
  if (n === 0) return "0";
  return Math.round(n).toLocaleString("ru-RU");
}

export function fmtSigned(n: number): string {
  if (n === 0) return "0";
  const s = Math.round(n).toLocaleString("ru-RU");
  return n > 0 ? `+${s}` : s;
}

export type PeriodKind = "past" | "current" | "future";

// Когда на экране ровно один месяц (любой — прошлый/текущий/будущий), трактуем
// его как текущий: колонки П/Ф/Ост, чтобы заранее внесённые операции сразу
// были видны в бюджете. Флаг выставляется в основном компоненте до рендера
// таблицы (рендер синхронный, матрица на экране одна).
// Флаг «на экране один месяц» — его выставляет страница перед отрисовкой.
// Модульное состояние, которое меняют во время рендера, — так исторически
// сложилось; трогать это здесь не стали, чтобы не переписывать 26 мест вызова
// getPeriodKind. Между модулями присвоить импортированную переменную нельзя,
// поэтому доступ через функцию.
let _singleMonthAsCurrent = false;

export function setSingleMonthAsCurrent(v: boolean): void {
  _singleMonthAsCurrent = v;
}

export function getPeriodKind(p: BudgetPeriod): PeriodKind {
  if (_singleMonthAsCurrent) return "current";
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (p.year < cy || (p.year === cy && p.month < cm)) return "past";
  if (p.year === cy && p.month === cm) return "current";
  return "future";
}

// Columns per period kind:
// past: Ф, Δ (2)  |  current: П, Ф, Ост (3)  |  future: П (1)
export function periodColCount(kind: PeriodKind): number {
  return kind === "current" ? 3 : kind === "past" ? 2 : 1;
}

// Топ-10 расходных статей периода выделяются типографикой (жирнее/темнее) —
// вес читается одинаково на любом экране, в отличие от прозрачной заливки.

// ── Editing state types ───────────────────────────────────────────────────────

export interface PlanEditTarget {
  categoryId: number;
  kind: string;
  year: number;
  month: number;
  periodLabel: string;
  categoryTitle: string;
  currentAmount: number;   // ручная строка бюджета (без плановых операций)
  plannedAmount?: number;  // сумма плановых операций периода (только категории)
  factAmount?: number;     // факт периода — для оценки точности прямо в окне
  currentNote: string;
  goalId?: number;        // set for goal/withdrawal rows
  goalPlanType?: string;  // "goal" or "withdrawal"
}

export interface FactDetailTarget {
  categoryId: number;
  categoryTitle: string;
  kind: string;
  periodLabel: string;
  dateFrom: string;
  dateTo: string;
  factAmount: number;
  excludeCategoryIds?: number[];
}

export interface EditingProps {
  /** category_id → кастомный эмодзи из справочника (null = авто по названию) */
  catVisual?: Record<number, string | null>;
  /** Ключи закрытых статей/целей: "type:id:year:month" */
  closures?: Set<string>;
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

export interface DragHandlers {
  onDragStart: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragOver: (e: React.DragEvent, catId: number, parentId: number | null) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  dragOver: { id: number; pos: "before" | "after" | "invalid" | "end" } | null;
}

// ── Inline cell input ────────────────────────────────────────────────────────

export function InlineCellInput({
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

// Точка «плановая операция без суммы»: по статье движение ожидается, сумма пока не задана
export function PlanDot() {
  return (
    <span
      title="Плановая операция без суммы — движение ожидается, сумма пока не задана"
      aria-label="плановая операция без суммы"
      style={{ color: "var(--app-accent)", fontSize: 16, lineHeight: 1, fontWeight: 700 }}
    >
      •
    </span>
  );
}

export function sectionTint(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("доход")) return "color-mix(in srgb, var(--c-success-ink) 9%, var(--bgt-section-bg))";
  if (l.includes("расход")) return "color-mix(in srgb, var(--c-danger-ink) 7%, var(--bgt-section-bg))";
  if (l.includes("отложен") || l.includes("взять")) return "color-mix(in srgb, var(--c-warning-ink) 9%, var(--bgt-section-bg))";
  if (l.includes("накоплен") || l.includes("цел")) return "color-mix(in srgb, var(--app-accent) 10%, var(--bgt-section-bg))";
  return "var(--bgt-section-bg)";
}

export function sectionEmoji(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("доход")) return "💰";
  if (l.includes("расход")) return "💸";
  if (l.includes("отложен") || l.includes("взять")) return "🏧";
  if (l.includes("накоплен") || l.includes("цел")) return "🐷";
  return "📊";
}
