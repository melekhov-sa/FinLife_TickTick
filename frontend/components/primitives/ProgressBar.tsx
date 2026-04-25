import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "success" | "warning" | "danger";
type Size = "sm" | "md" | "lg";

export interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: Variant;
  size?: Size;
  /** Показать стандартную подпись "value / max ... NN%" над треком. */
  showLabel?: boolean;
  /** Кастомная подпись слева вместо стандартной "value / max". */
  label?: ReactNode;
  className?: string;
}

const heightClasses: Record<Size, string> = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

const fillClasses: Record<Variant, string> = {
  primary: "bg-gradient-to-r from-indigo-500 to-violet-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-red-500",
};

// Striped overflow indicator (inline so primitive не зависит от globals.css)
const overflowStripeStyle: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0, rgba(255,255,255,0.35) 4px, transparent 4px, transparent 8px)",
};

function formatNumber(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function ProgressBar({
  value,
  max = 100,
  variant = "primary",
  size = "md",
  showLabel = false,
  label,
  className,
}: ProgressBarProps) {
  const overflow = value > max;
  const effectiveVariant: Variant = overflow ? "danger" : variant;
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const displayPct = Math.round((value / safeMax) * 100);

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[12px] text-slate-500 dark:text-slate-400">
            {label ?? <>{formatNumber(value)} / {formatNumber(max)}</>}
          </div>
          <div
            className={cn(
              "text-[12px] font-semibold tabular-nums",
              overflow ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200",
            )}
          >
            {displayPct}%
          </div>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          "relative w-full overflow-hidden rounded-full",
          "bg-slate-200 dark:bg-white/[0.06]",
          heightClasses[size],
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300 ease-out", fillClasses[effectiveVariant])}
          style={{
            width: `${overflow ? 100 : pct}%`,
            ...(overflow ? overflowStripeStyle : null),
          }}
        />
      </div>
    </div>
  );
}
