"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  size?: Size;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

const trackSize: Record<Size, string> = {
  sm: "w-8 h-[18px]",
  md: "w-10 h-[22px]",
};

const thumbSize: Record<Size, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-[18px] h-[18px]",
};

const thumbTranslate: Record<Size, string> = {
  sm: "translate-x-[14px]",
  md: "translate-x-[18px]",
};

const labelSizeClass: Record<Size, string> = {
  sm: "text-[12px]",
  md: "text-[13px]",
};

export function Switch({
  checked,
  onChange,
  label,
  description,
  size = "md",
  disabled = false,
  className,
  ariaLabel,
}: SwitchProps) {
  const reactId = useId();
  const switchId = reactId;

  function toggle() {
    if (disabled) return;
    onChange(!checked);
  }

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggle();
    }
  }

  const switchEl = (
    <button
      type="button"
      role="switch"
      id={switchId}
      aria-checked={checked}
      aria-label={!label ? ariaLabel : undefined}
      disabled={disabled}
      onClick={toggle}
      onKeyDown={onKey}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors p-[2px]",
        trackSize[size],
        checked
          ? "bg-indigo-600 dark:bg-indigo-500"
          : "bg-slate-300 dark:bg-white/15",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-1",
        disabled && "opacity-50 pointer-events-none cursor-not-allowed",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block rounded-full bg-[#fff] shadow-sm transition-transform duration-150",
          thumbSize[size],
          checked ? thumbTranslate[size] : "translate-x-0",
        )}
      />
    </button>
  );

  if (!label && !description) {
    return <span className={className}>{switchEl}</span>;
  }

  return (
    <label
      htmlFor={switchId}
      className={cn(
        "inline-flex items-start gap-3 select-none",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      {switchEl}
      <span className="flex flex-col leading-tight">
        {label && (
          <span className={cn("text-slate-900 dark:text-slate-100", labelSizeClass[size])}>
            {label}
          </span>
        )}
        {description && (
          <span className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
