"use client";

import { cn } from "@/lib/utils";

/**
 * Counter — компактный числовой бейдж рядом с title.
 * Используется в слоте `counter` у PageHeader (например, «Деньги (247)»).
 */

export type CounterTone = "neutral" | "accent" | "success" | "danger";

export interface CounterProps {
  value: number | string;
  tone?: CounterTone;
  className?: string;
}

const TONE: Record<CounterTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--c-neutral-bg)",   fg: "var(--c-neutral-fg)" },
  accent:  { bg: "var(--app-accent-weak)", fg: "var(--app-accent-ink)" },
  success: { bg: "var(--c-success-bg)",   fg: "var(--c-success-fg)" },
  danger:  { bg: "var(--c-danger-bg)",    fg: "var(--c-danger-fg)" },
};

export function Counter({ value, tone = "neutral", className }: CounterProps) {
  const t = TONE[tone];
  return (
    <span
      className={cn("inline-flex items-center justify-center", className)}
      style={{
        fontVariantNumeric: "tabular-nums",
        minWidth: 22,
        height: 22,
        padding: "0 7px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: t.bg,
        color: t.fg,
      }}
    >
      {value}
    </span>
  );
}

export default Counter;
