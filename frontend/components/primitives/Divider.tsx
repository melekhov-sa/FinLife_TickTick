"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  label?: ReactNode;
  spacing?: "none" | "sm" | "md" | "lg";
  className?: string;
}

export function Divider({
  orientation = "horizontal",
  label,
  spacing = "md",
  className,
}: DividerProps) {
  if (orientation === "vertical") {
    const mx =
      spacing === "none"
        ? ""
        : spacing === "sm"
        ? "mx-2"
        : spacing === "lg"
        ? "mx-6"
        : "mx-4";
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn(
          "w-px self-stretch bg-slate-200 dark:bg-white/[0.07]",
          mx,
          className,
        )}
        style={{ minHeight: "1em" }}
      />
    );
  }

  const my =
    spacing === "none"
      ? ""
      : spacing === "sm"
      ? "my-2"
      : spacing === "lg"
      ? "my-6"
      : "my-4";

  if (label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn("flex items-center gap-3", my, className)}
      >
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.07]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/45">
          {label}
        </span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-white/[0.07]" />
      </div>
    );
  }

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cn("h-px bg-slate-200 dark:bg-white/[0.07]", my, className)}
    />
  );
}
