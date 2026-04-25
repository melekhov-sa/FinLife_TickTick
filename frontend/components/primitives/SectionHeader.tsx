"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: Size;
  className?: string;
}

export function SectionHeader({ title, description, actions, size = "md", className }: SectionHeaderProps) {
  if (size === "sm") {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </div>
    );
  }
  return (
    <div className={cn("flex items-end justify-between gap-3 flex-wrap", className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
