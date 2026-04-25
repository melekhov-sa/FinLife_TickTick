"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  delta?: ReactNode;
  deltaDirection?: "up" | "down" | "neutral";
  size?: "sm" | "md" | "lg";
  align?: "left" | "center";
  className?: string;
  valueClassName?: string;
}

export function Stat({
  label,
  value,
  delta,
  deltaDirection = "neutral",
  size = "md",
  align = "left",
  className,
  valueClassName,
}: StatProps) {
  const valueCls =
    size === "sm" ? "text-[14px]" : size === "lg" ? "text-[26px]" : "text-[18px]";
  const labelCls =
    size === "sm" ? "text-[9px]" : size === "lg" ? "text-[12px]" : "text-[11px]";
  const deltaCls = size === "sm" ? "text-[11px]" : "text-[12px]";

  const deltaColor =
    deltaDirection === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : deltaDirection === "down"
      ? "text-red-600 dark:text-red-400"
      : "text-slate-500 dark:text-white/55";

  const alignCls = align === "center" ? "items-center text-center" : "items-start";

  return (
    <div className={cn("flex flex-col", alignCls, className)}>
      <div
        className={cn(
          labelCls,
          "uppercase tracking-wider text-slate-500 dark:text-white/45 font-medium",
        )}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span
          className={cn(
            valueCls,
            "font-semibold tabular-nums text-slate-900 dark:text-[#fff]",
            valueClassName,
          )}
        >
          {value}
        </span>
        {delta != null && (
          <span
            className={cn(
              deltaCls,
              "font-medium tabular-nums inline-flex items-center gap-0.5",
              deltaColor,
            )}
          >
            {deltaDirection === "up" && <ArrowUp size={11} />}
            {deltaDirection === "down" && <ArrowDown size={11} />}
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
