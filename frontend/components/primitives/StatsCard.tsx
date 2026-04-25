"use client";

import { ReactNode, isValidElement, MouseEvent } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./Card";

type Background = "default" | "primary" | "success" | "warning" | "danger";
type Direction = "up" | "down" | "neutral";

interface StatsCardProps {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: ReactNode; label?: ReactNode; direction?: Direction };
  icon?: ReactNode;
  iconBackground?: Background;
  className?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

const bgClass: Record<Background, string> = {
  default: "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300",
  primary: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

function detectDirection(value: ReactNode): Direction {
  const s = String(value).trim();
  if (s.startsWith("+")) return "up";
  if (s.startsWith("−") || s.startsWith("-")) return "down";
  return "neutral";
}

export function StatsCard({
  label,
  value,
  delta,
  icon,
  iconBackground = "default",
  className,
  onClick,
}: StatsCardProps) {
  const dir = delta?.direction ?? (delta ? detectDirection(delta.value) : null);
  const dirClass =
    dir === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : dir === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-500 dark:text-slate-400";
  const DirIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <Card padding="md" onClick={onClick} hover={!!onClick} className={className}>
      <div className="flex items-start gap-3">
        {icon && (
          <div
            className={cn(
              "inline-flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
              bgClass[iconBackground],
            )}
          >
            {isValidElement(icon) ? icon : icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{label}</div>
          <div className="text-[22px] font-semibold tabular-nums text-slate-900 dark:text-slate-100 leading-tight mt-0.5">
            {value}
          </div>
          {delta && (
            <div className="mt-1 flex items-center gap-1.5 text-[12px]">
              <span className={cn("inline-flex items-center gap-1 font-medium tabular-nums", dirClass)}>
                <DirIcon size={12} />
                {delta.value}
              </span>
              {delta.label && (
                <span className="text-slate-400 dark:text-slate-500">{delta.label}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
