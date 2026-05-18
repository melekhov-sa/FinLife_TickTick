"use client";

/**
 * Chart tokens — единая палитра, типографика, tooltip-стиль для всех графиков.
 *
 * НЕ ленить и НЕ хардкодить цвета в каждом графике — только отсюда.
 * Цвета подобраны так, чтобы соседние оттенки различались и для дальтоников.
 */

export const CHART_PALETTE = [
  "#6366F1", // indigo  — primary
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#8B5CF6", // violet
  "#F97316", // orange
  "#84CC16", // lime
  "#14B8A6", // teal
  "#F43F5E", // rose
  "#3B82F6", // blue
  "#A855F7", // purple
] as const;

export const CHART_PAIR = {
  income:  "#10B981",
  expense: "#EF4444",
  neutral: "#94A3B8",
  accent:  "#6366F1",
  warning: "#F59E0B",
} as const;

/** Цвет для серии по индексу (с циклом). */
export function seriesColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

export const CHART_AXIS = {
  fill: "var(--t-muted)",
  fontSize: 11,
  fontWeight: 500,
} as const;

export const CHART_GRID = {
  stroke: "var(--app-border)",
  strokeDasharray: "3 3",
} as const;

/** Стиль контейнера tooltip — для recharts <Tooltip contentStyle/itemStyle/labelStyle>. */
export const CHART_TOOLTIP_STYLE = {
  background: "var(--app-card-bg)",
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  boxShadow:
    "0 16px 32px -16px rgba(0,0,0,.18), 0 4px 12px -4px rgba(0,0,0,.10)",
  padding: "8px 10px",
  fontSize: 12,
  color: "var(--t-primary)",
} as const;

export const CHART_TOOLTIP_ITEM_STYLE = {
  color: "var(--t-secondary)",
  fontSize: 12,
  padding: 0,
} as const;

export const CHART_TOOLTIP_LABEL_STYLE = {
  color: "var(--t-muted)",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  marginBottom: 4,
};
