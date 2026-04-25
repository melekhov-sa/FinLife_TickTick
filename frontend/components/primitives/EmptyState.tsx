"use client";

import { ReactNode, isValidElement } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: Size;
  className?: string;
}

const cfg: Record<Size, { iconBox: string; iconSize: number; title: string; desc: string; py: string }> = {
  sm: { iconBox: "w-10 h-10", iconSize: 18, title: "text-[13px]", desc: "text-[12px]", py: "py-6" },
  md: { iconBox: "w-14 h-14", iconSize: 24, title: "text-[15px]", desc: "text-[13px]", py: "py-10" },
  lg: { iconBox: "w-20 h-20", iconSize: 32, title: "text-[18px]", desc: "text-[14px]", py: "py-16" },
};

export function EmptyState({ icon, title, description, action, size = "md", className }: EmptyStateProps) {
  const c = cfg[size];
  return (
    <div className={cn("flex flex-col items-center text-center", c.py, className)}>
      {icon && (
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-full mb-4",
            "bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-slate-400",
            c.iconBox,
          )}
        >
          {isValidElement(icon) ? icon : icon}
        </div>
      )}
      <div className={cn("font-medium text-slate-900 dark:text-slate-100", c.title)}>{title}</div>
      {description && (
        <div className={cn("mt-1.5 max-w-[40ch] text-slate-500 dark:text-slate-400", c.desc)}>
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
