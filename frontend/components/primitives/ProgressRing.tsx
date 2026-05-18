"use client";

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ProgressRing — круглый прогресс-индикатор (SVG, без зависимостей).
 *
 *   • value — текущее значение (0..max)
 *   • max — потолок (default 100)
 *   • size — диаметр кольца в px (default 80)
 *   • thickness — толщина дуги (default size/10)
 *   • Цвет дуги — accent (или color="success|danger|warning|neutral" или явный CSS-цвет).
 *   • При value >= max автоматически переключается на success-цвет (override через color).
 *   • Center — слот для содержимого внутри кольца (число, label).
 *
 * Никаких токенов в globals.css. Использует --app-border, --c-*-ink, --app-accent.
 */

export type ProgressRingTone = "accent" | "success" | "danger" | "warning" | "neutral";

const TONE_COLOR: Record<ProgressRingTone, string> = {
  accent:  "var(--app-accent)",
  success: "var(--c-success-ink)",
  danger:  "var(--c-danger-ink)",
  warning: "var(--c-warning-ink)",
  neutral: "var(--t-muted)",
};

export interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  /** Tone token or any CSS color. */
  color?: ProgressRingTone | string;
  /** Цвет дорожки. По умолчанию --app-border. */
  trackColor?: string;
  /** При value >= max автоматически переключиться на success (default true). */
  autoComplete?: boolean;
  /** Что показать внутри кольца. */
  center?: ReactNode;
  /** Для accessible-чтения. */
  ariaLabel?: string;
  className?: string;
}

function isToneKey(c: string): c is ProgressRingTone {
  return c === "accent" || c === "success" || c === "danger" || c === "warning" || c === "neutral";
}

export const ProgressRing = forwardRef<SVGSVGElement, ProgressRingProps>(function ProgressRing(
  {
    value,
    max = 100,
    size = 80,
    thickness,
    color = "accent",
    trackColor = "var(--app-border)",
    autoComplete = true,
    center,
    ariaLabel,
    className,
  },
  ref,
) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const isComplete = pct >= 1;

  const resolvedColor = (() => {
    if (autoComplete && isComplete) return TONE_COLOR.success;
    if (typeof color === "string" && isToneKey(color)) return TONE_COLOR[color];
    return color as string;
  })();

  const t = thickness ?? Math.max(4, Math.round(size / 10));
  const r = (size - t) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role={ariaLabel ? "img" : undefined}
        aria-label={ariaLabel}
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ display: "block" }}
      >
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={t}
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={t}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeDashoffset={c / 4}     // start at 12 o'clock
          strokeLinecap="round"
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "center",
            transition: "stroke-dasharray 400ms cubic-bezier(.22,.61,.36,1), stroke 200ms",
          }}
        />
      </svg>
      {center != null && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none text-center"
          style={{ padding: t + 2 }}
        >
          {center}
        </div>
      )}
    </div>
  );
});

export default ProgressRing;
