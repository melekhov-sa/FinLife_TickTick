"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * FilterChip — один чип-фильтр для строки `filters` в PageHeader.
 *
 * Состояния:
 *   • inactive — пустой фильтр (только label, серая обводка)
 *   • active   — выбрано значение (accent-weak фон, value жирным)
 *
 * Кнопка ✕ появляется когда передан onRemove.
 */

export interface FilterChipProps {
  icon?: ReactNode;
  label: ReactNode;
  /** Выбранное значение фильтра. Если есть — чип переходит в active-look. */
  value?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
}

export function FilterChip({
  icon,
  label,
  value,
  active,
  onClick,
  onRemove,
  className,
}: FilterChipProps) {
  const isActive = active ?? value != null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 shrink-0 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60",
        className,
      )}
      style={{
        height: 30,
        padding: "0 10px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        background: isActive ? "var(--app-accent-weak)" : "var(--app-card-bg)",
        color: isActive ? "var(--app-accent-ink)" : "var(--t-secondary)",
        border: `1px solid ${isActive ? "transparent" : "var(--app-border)"}`,
      }}
    >
      {icon}
      <span>{label}</span>
      {value != null && (
        <>
          <span style={{ color: "var(--t-faint)" }}>·</span>
          <span style={{ color: isActive ? "var(--app-accent-ink)" : "var(--t-primary)", fontWeight: 600 }}>
            {value}
          </span>
        </>
      )}
      {value != null && onRemove && (
        <span
          role="button"
          aria-label="Очистить фильтр"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="inline-flex items-center justify-center opacity-60 hover:opacity-100"
          style={{ marginLeft: 2, marginRight: -3, padding: 2 }}
        >
          <X size={10} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}

export default FilterChip;
