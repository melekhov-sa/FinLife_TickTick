import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "warning" | "danger" | "info" | "neutral" | "accent";
type Size = "sm" | "md";

export interface BadgeProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  className?: string;
}

const variantClasses: Record<Variant, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger:
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  info:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  neutral:
    "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-300",
  accent:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-5 px-1.5 text-[10px] gap-1 rounded-md",
  md: "h-6 px-2 text-[11px] gap-1 rounded-md",
};

export function Badge({
  children,
  variant = "neutral",
  size = "md",
  leftIcon,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wide select-none",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
    >
      {leftIcon && (
        <span aria-hidden className="shrink-0 inline-flex">
          {leftIcon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
