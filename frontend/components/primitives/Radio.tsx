"use client";

import { useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

export interface RadioOption<T extends string | number> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string | number> {
  value: T | null;
  onChange: (value: T) => void;
  options: RadioOption<T>[];
  orientation?: "vertical" | "horizontal";
  size?: Size;
  name?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

const dotSize: Record<Size, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
};

const innerDotSize: Record<Size, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
};

const labelSize: Record<Size, string> = {
  sm: "text-[12px]",
  md: "text-[13px]",
};

export function RadioGroup<T extends string | number>({
  value,
  onChange,
  options,
  orientation = "vertical",
  size = "md",
  name,
  disabled = false,
  className,
  ariaLabel,
}: RadioGroupProps<T>) {
  const autoName = useId();
  const groupName = name ?? autoName;
  const itemRefs = useRef<Array<HTMLInputElement | null>>([]);

  const enabledIndexes = options
    .map((o, i) => (o.disabled || disabled ? -1 : i))
    .filter((i) => i !== -1);

  function focusByOffset(currentIdx: number, delta: number) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(currentIdx);
    const nextPos =
      pos === -1
        ? 0
        : (pos + delta + enabledIndexes.length) % enabledIndexes.length;
    const nextIdx = enabledIndexes[nextPos];
    const el = itemRefs.current[nextIdx];
    el?.focus();
    onChange(options[nextIdx].value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>, idx: number) {
    const isHorizontal = orientation === "horizontal";
    const next = isHorizontal ? "ArrowRight" : "ArrowDown";
    const prev = isHorizontal ? "ArrowLeft" : "ArrowUp";
    if (e.key === next) {
      e.preventDefault();
      focusByOffset(idx, 1);
    } else if (e.key === prev) {
      e.preventDefault();
      focusByOffset(idx, -1);
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-2" : "flex-row flex-wrap gap-3",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      {options.map((opt, idx) => {
        const isChecked = value === opt.value;
        const itemDisabled = opt.disabled || disabled;
        const itemId = `${groupName}-${idx}`;
        return (
          <label
            key={String(opt.value)}
            htmlFor={itemId}
            className={cn(
              "inline-flex items-start gap-2 select-none",
              itemDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span className="relative inline-flex shrink-0 items-center justify-center mt-px">
              <input
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                id={itemId}
                type="radio"
                name={groupName}
                value={String(opt.value)}
                checked={isChecked}
                disabled={itemDisabled}
                onChange={() => onChange(opt.value)}
                onKeyDown={(e) => onKeyDown(e, idx)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "inline-flex items-center justify-center rounded-full border transition-colors",
                  dotSize[size],
                  isChecked
                    ? "bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500"
                    : "bg-white border-slate-300 dark:bg-white/[0.03] dark:border-white/20",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/60 peer-focus-visible:ring-offset-1",
                )}
              >
                {isChecked && (
                  <span className={cn("rounded-full bg-[#fff]", innerDotSize[size])} />
                )}
              </span>
            </span>

            <span className="flex flex-col leading-tight">
              <span className={cn("text-slate-900 dark:text-slate-100", labelSize[size])}>
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {opt.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}
