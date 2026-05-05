"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * PriorityDot
 *
 * Точка приоритета задачи. 5 уровней:
 *   none    — пунктирный кружок (приоритет не задан)
 *   low     — серый
 *   medium  — янтарный
 *   high    — красный
 *   urgent  — насыщенный красный
 *
 * Семантика и подписи зафиксированы в PRIORITY_LABELS — используются для title и aria-label.
 */

export type PriorityLevel = "none" | "low" | "medium" | "high" | "urgent";

export interface PriorityDotProps {
  level?: PriorityLevel;
  /** Диаметр в px. По умолчанию 8. */
  size?: number;
  /** Дополнительное мягкое кольцо вокруг точки. */
  withRing?: boolean;
  className?: string;
  /** Кастомная подсказка (заменяет дефолт). */
  title?: string;
}

export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  none: "transparent",
  low: "#94A3B8",
  medium: "#F59E0B",
  high: "#EF4444",
  urgent: "#DC2626",
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  none: "Без приоритета",
  low: "Низкий приоритет",
  medium: "Средний приоритет",
  high: "Высокий приоритет",
  urgent: "Срочно",
};

export const PriorityDot = forwardRef<HTMLSpanElement, PriorityDotProps>(function PriorityDot(
  { level = "none", size = 8, withRing = false, className, title },
  ref,
) {
  const color = PRIORITY_COLORS[level];
  const isNone = level === "none";
  const label = title ?? PRIORITY_LABELS[level];

  return (
    <span
      ref={ref}
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-block shrink-0", className)}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: isNone ? "transparent" : color,
        border: isNone ? "1.5px dashed var(--t-faint)" : withRing ? `2px solid ${color}33` : "none",
        boxShadow: !isNone && withRing ? `0 0 0 2px ${color}1f` : "none",
      }}
    />
  );
});

export default PriorityDot;
