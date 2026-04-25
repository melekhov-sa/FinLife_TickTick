"use client";

import { ReactNode, useRef, KeyboardEvent } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "underline" | "segmented" | "pills";
type Size = "sm" | "md";

export interface TabOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: LucideIcon;
  count?: number;
  disabled?: boolean;
}

interface TabsProps<V extends string = string> {
  value: V;
  onChange: (v: V) => void;
  options: TabOption<V>[];
  variant?: Variant;
  size?: Size;
  className?: string;
}

const sizeCfg: Record<Size, { h: string; text: string; px: string; iconSize: number }> = {
  sm: { h: "h-8", text: "text-[12px]", px: "px-3", iconSize: 12 },
  md: { h: "h-9", text: "text-[13px]", px: "px-3.5", iconSize: 14 },
};

function Count({
  n,
  active,
  variant,
}: {
  n: number;
  active: boolean;
  variant: Variant;
}) {
  let cls: string;
  if (variant === "pills" && active) {
    cls = "bg-white text-indigo-700";
  } else if (active) {
    cls = "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300";
  } else {
    cls = "bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-slate-300";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold uppercase tracking-wide rounded h-4 px-1 text-[10px] tabular-nums",
        cls,
      )}
    >
      {n}
    </span>
  );
}

export function Tabs<V extends string = string>({
  value,
  onChange,
  options,
  variant = "underline",
  size = "md",
  className,
}: TabsProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i !== -1);
  const sz = sizeCfg[size];

  function onKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const pos = enabled.indexOf(idx);
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = enabled[(pos + dir + enabled.length) % enabled.length];
    refs.current[next]?.focus();
    onChange(options[next].value);
  }

  if (variant === "segmented") {
    return (
      <div role="tablist" className={cn("inline-flex items-center rounded-lg p-1 bg-slate-100 dark:bg-white/[0.04]", className)}>
        {options.map((o, i) => {
          const active = o.value === value;
          const IconC = o.icon;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              aria-selected={active}
              disabled={o.disabled}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md font-medium transition-all",
                sz.h,
                sz.text,
                sz.px,
                active
                  ? "bg-white text-slate-900 shadow-sm dark:bg-white/[0.10] dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
                o.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {IconC && <IconC size={sz.iconSize} />}
              <span>{o.label}</span>
              {typeof o.count === "number" && <Count n={o.count} active={active} variant={variant} />}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "pills") {
    return (
      <div role="tablist" className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
        {options.map((o, i) => {
          const active = o.value === value;
          const IconC = o.icon;
          return (
            <button
              key={o.value}
              ref={(el) => { refs.current[i] = el; }}
              role="tab"
              aria-selected={active}
              disabled={o.disabled}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
                sz.h,
                sz.text,
                sz.px,
                active
                  ? "bg-indigo-600 text-[#fff] dark:bg-indigo-500"
                  : "bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]",
                o.disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {IconC && <IconC size={sz.iconSize} />}
              <span>{o.label}</span>
              {typeof o.count === "number" && <Count n={o.count} active={active} variant={variant} />}
            </button>
          );
        })}
      </div>
    );
  }

  // underline
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-slate-200 dark:border-white/[0.07]", className)}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        const IconC = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            aria-selected={active}
            disabled={o.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "inline-flex items-center gap-1.5 font-medium transition-colors -mb-px border-b-2",
              sz.h,
              sz.text,
              sz.px,
              active
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
              o.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            {IconC && <IconC size={sz.iconSize} />}
            <span>{o.label}</span>
            {typeof o.count === "number" && <Count n={o.count} active={active} variant={variant} />}
          </button>
        );
      })}
    </div>
  );
}
