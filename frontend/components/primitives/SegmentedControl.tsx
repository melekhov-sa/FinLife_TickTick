"use client";

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SegmentedControl — выбор режима отображения (НЕ навигация).
 *
 *   role="radiogroup" + aria-checked — потому что это выбор одного из вариантов,
 *   а не переход в раздел. Для разделов страницы — <Tabs/> из 3.C.
 *
 *   • Равноширинные сегменты в одной плашке (по умолчанию fullWidth=true).
 *   • fullWidth=false — inline-вариант для компактных мест справа от заголовка.
 *   • Поддерживает иконку слева от label.
 *   • Размеры sm (h=30) и md (h=36).
 */

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlItem<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  items: SegmentedControlItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: SegmentedControlSize;
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  function SegmentedControl(
    {
      items,
      value,
      onChange,
      size = "md",
      fullWidth = true,
      ariaLabel,
      className,
    },
    ref,
  ) {
    const tok =
      size === "sm"
        ? { h: 30, padX: 10, fs: 12.5, gap: 6, rad: 8 }
        : { h: 36, padX: 14, fs: 13.5, gap: 6, rad: 10 };

    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-label={ariaLabel}
        className={cn(fullWidth ? "flex w-full" : "inline-flex", className)}
        style={{
          background: "var(--c-neutral-bg)",
          border: "1px solid var(--app-border)",
          borderRadius: tok.rad + 2,
          padding: 2,
          gap: 2,
        }}
      >
        {items.map((it) => {
          const active = it.id === value;
          return (
            <button
              key={it.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={it.disabled}
              onClick={() => onChange(it.id)}
              className={cn(
                "inline-flex items-center justify-center transition-colors font-medium",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]",
                fullWidth && "flex-1",
              )}
              style={{
                height: tok.h,
                padding: `0 ${tok.padX}px`,
                gap: tok.gap,
                fontSize: tok.fs,
                borderRadius: tok.rad,
                background: active ? "var(--app-card-bg)" : "transparent",
                color: active ? "var(--t-primary)" : "var(--t-muted)",
                boxShadow: active
                  ? "0 1px 2px rgba(16,24,40,.06), 0 0 0 1px rgba(16,24,40,.04)"
                  : "none",
              }}
            >
              {it.icon}
              {it.label}
            </button>
          );
        })}
      </div>
    );
  },
);

export default SegmentedControl;
