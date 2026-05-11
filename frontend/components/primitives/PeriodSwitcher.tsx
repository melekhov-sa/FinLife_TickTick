"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PeriodSwitcher — сегмент scope (день/неделя/месяц/год) + стрелки prev/next + текущий период.
 *
 * Используется внутри слота `period` у PageHeader.
 */

export type PeriodScope = "day" | "week" | "month" | "year";

const SCOPE_LABELS: Record<PeriodScope, string> = {
  day: "День",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

export interface PeriodSwitcherProps {
  scope: PeriodScope;
  scopes?: PeriodScope[];
  /** Подпись текущего периода («20 — 26 апреля», «Апрель 2026»). */
  label: string;
  onScopeChange?: (s: PeriodScope) => void;
  onPrev?: () => void;
  onNext?: () => void;
  className?: string;
}

export function PeriodSwitcher({
  scope,
  scopes = ["day", "week", "month", "year"],
  label,
  onScopeChange,
  onPrev,
  onNext,
  className,
}: PeriodSwitcherProps) {
  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      {/* scope segmented */}
      <div
        className="inline-flex gap-0.5"
        style={{
          background: "var(--app-card-bg)",
          border: "1px solid var(--app-border)",
          borderRadius: 10,
          padding: 2,
        }}
      >
        {scopes.map((s) => {
          const active = s === scope;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onScopeChange?.(s)}
              aria-pressed={active}
              className="px-2.5 transition-colors"
              style={{
                height: 28,
                fontSize: 12.5,
                fontWeight: 500,
                borderRadius: 8,
                color: active ? "var(--t-primary)" : "var(--t-muted)",
                background: active ? "var(--app-bg)" : "transparent",
                boxShadow: active ? "0 1px 0 rgba(0,0,0,.04)" : "none",
              }}
            >
              {SCOPE_LABELS[s]}
            </button>
          );
        })}
      </div>

      {/* period nav */}
      <div
        className="inline-flex items-center gap-0.5"
        style={{
          background: "var(--app-card-bg)",
          border: "1px solid var(--app-border)",
          borderRadius: 10,
          height: 32,
          padding: "0 4px",
        }}
      >
        <button
          type="button"
          onClick={onPrev}
          aria-label="Назад"
          className="inline-flex items-center justify-center transition-colors hover:bg-[var(--app-accent-weak)]"
          style={{ width: 28, height: 28, borderRadius: 6, color: "var(--t-secondary)" }}
        >
          <ChevronLeft size={14} strokeWidth={1.75} />
        </button>
        <span
          className="px-1"
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--t-primary)",
            minWidth: 110,
            textAlign: "center",
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Вперёд"
          className="inline-flex items-center justify-center transition-colors hover:bg-[var(--app-accent-weak)]"
          style={{ width: 28, height: 28, borderRadius: 6, color: "var(--t-secondary)" }}
        >
          <ChevronRight size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

export default PeriodSwitcher;
