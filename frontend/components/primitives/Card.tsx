"use client";

import { ReactNode, MouseEvent } from "react";
import { cn } from "@/lib/utils";

type Padding = "none" | "sm" | "md" | "lg";

const cardPad: Record<Padding, string> = {
  none: "p-0",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

interface CardProps {
  children: ReactNode;
  hover?: boolean;
  padding?: Padding;
  className?: string;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

export function Card({ children, hover, padding = "md", className, onClick }: CardProps) {
  const interactive = !!onClick;
  const Comp = interactive ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      type={interactive ? "button" : undefined}
      className={cn(
        "block w-full text-left rounded-xl border bg-white border-slate-200 shadow-sm",
        "dark:bg-white/[0.03] dark:border-white/[0.07]",
        cardPad[padding],
        (hover || interactive) && "transition-shadow hover:shadow-md",
        interactive && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60",
        className,
      )}
    >
      {children}
    </Comp>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0 flex-1">
        {title && (
          <div className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[13px] text-slate-700 dark:text-slate-300", className)}>{children}</div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mt-3 pt-3 border-t border-slate-100 dark:border-white/[0.05] flex items-center justify-between gap-2 text-[12px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
