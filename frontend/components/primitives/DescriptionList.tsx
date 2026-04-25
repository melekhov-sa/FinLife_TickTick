"use client";

import { createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Orientation = "horizontal" | "vertical";
type Size = "sm" | "md";

interface DLContextValue {
  orientation: Orientation;
  size: Size;
}

const DLContext = createContext<DLContextValue>({
  orientation: "vertical",
  size: "md",
});

export interface DescriptionListProps {
  orientation?: Orientation;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export function DescriptionList({
  orientation = "vertical",
  size = "md",
  className,
  children,
}: DescriptionListProps) {
  const gap =
    orientation === "vertical"
      ? size === "sm"
        ? "gap-3"
        : "gap-4"
      : size === "sm"
      ? "gap-2"
      : "gap-3";

  return (
    <DLContext.Provider value={{ orientation, size }}>
      <dl className={cn("flex flex-col", gap, className)}>{children}</dl>
    </DLContext.Provider>
  );
}

export interface DescriptionItemProps {
  label: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function DescriptionItem({ label, value, children, className }: DescriptionItemProps) {
  const { orientation, size } = useContext(DLContext);

  const labelCls =
    orientation === "vertical"
      ? cn(
          size === "sm" ? "text-[10px]" : "text-[11px]",
          "uppercase tracking-wider text-slate-500 dark:text-white/45 font-medium",
        )
      : cn(
          size === "sm" ? "text-[12px]" : "text-[13px]",
          "text-slate-500 dark:text-white/55 font-medium",
        );

  const valueCls = cn(
    size === "sm" ? "text-[13px]" : "text-[14px]",
    "text-slate-800 dark:text-[#fff]",
  );

  const content = children ?? value;

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex items-start gap-4", className)}>
        <dt className={cn(labelCls, "shrink-0 pt-0.5")} style={{ width: 140 }}>
          {label}
        </dt>
        <dd className={valueCls}>{content}</dd>
      </div>
    );
  }

  return (
    <div className={className}>
      <dt className={cn(labelCls, "mb-1")}>{label}</dt>
      <dd className={valueCls}>{content}</dd>
    </div>
  );
}
