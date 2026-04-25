"use client";

import { forwardRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "neutral" | "accent";
type Size = "sm" | "md";

export interface ChipProps {
  label: ReactNode;
  selected?: boolean;
  emoji?: string;
  variant?: Variant;
  size?: Size;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12px] gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-lg",
};

const removeBtnSize: Record<Size, number> = {
  sm: 12,
  md: 14,
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    label,
    selected = false,
    emoji,
    variant = "neutral",
    size = "md",
    onClick,
    onRemove,
    className,
    disabled,
  },
  ref,
) {
  const isInteractive = Boolean(onClick) || Boolean(onRemove);

  // resolve color tokens
  const stateClasses = selected
    ? variant === "accent"
      ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:border-indigo-500"
      : "bg-slate-900 text-white border-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:border-white"
    : variant === "accent"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 " +
        "dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/30 dark:hover:bg-indigo-500/15"
      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 " +
        "dark:bg-white/[0.03] dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/[0.06] dark:hover:border-white/20";

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        "inline-flex items-center border font-medium select-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:pointer-events-none",
        !isInteractive && "cursor-default",
        sizeClasses[size],
        stateClasses,
        className,
      )}
    >
      {emoji && (
        <span aria-hidden className="shrink-0 leading-none">
          {emoji}
        </span>
      )}
      <span className="truncate">{label}</span>
      {onRemove && (
        <span
          role="button"
          aria-label="Удалить"
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
          className={cn(
            "shrink-0 inline-flex items-center justify-center rounded-sm -mr-0.5 ml-0.5",
            "opacity-70 hover:opacity-100 cursor-pointer",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
          )}
        >
          <X size={removeBtnSize[size]} />
        </span>
      )}
    </button>
  );
});
