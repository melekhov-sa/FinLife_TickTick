"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_PAIR,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
} from "./chart-tokens";

/**
 * BarChart — единый стиль столбчатой диаграммы.
 *
 *   • Одна серия. Для двух — используй DualBarChart (Доходы/Расходы).
 *   • highlightPeak=true → пиковый столбец красится цветом peakColor (default red).
 *   • formatValue — формат tooltip и (опционально) Y-оси.
 *
 * Высота и общий padding контейнера управляются caller'ом — внутри только canvas.
 */

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  /** Подсветить пиковое значение. */
  highlightPeak?: boolean;
  peakColor?: string;
  /** Формат значения. */
  formatValue?: (v: number) => string;
  /** Показать Y-ось. По умолчанию false (минималистично). */
  showYAxis?: boolean;
  /** Текстовая подпись пика снизу. */
  peakCaption?: (peak: BarDatum) => string;
}

export function BarChart({
  data,
  height = 200,
  color = CHART_PAIR.accent,
  highlightPeak = false,
  peakColor = CHART_PAIR.expense,
  formatValue,
  showYAxis = false,
  peakCaption,
}: BarChartProps) {
  const fmt = formatValue ?? ((v: number) =>
    new Intl.NumberFormat("ru-RU").format(v));

  const peakIndex = useMemo(() => {
    if (!highlightPeak || data.length === 0) return -1;
    return data.reduce(
      (best, d, i) => (d.value > data[best].value ? i : best),
      0,
    );
  }, [data, highlightPeak]);

  return (
    <div className="w-full">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RBarChart data={data} margin={{ top: 8, right: 8, left: showYAxis ? 0 : 8, bottom: 4 }}>
            <CartesianGrid {...CHART_GRID} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ ...CHART_AXIS }}
              tickLine={false}
              axisLine={false}
            />
            {showYAxis && (
              <YAxis
                tick={{ ...CHART_AXIS }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => fmt(Number(v))}
                width={40}
              />
            )}
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,.06)" }}
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              formatter={(value) => [fmt(Number(value)), ""]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === peakIndex ? peakColor : color}
                  fillOpacity={highlightPeak && i !== peakIndex ? 0.55 : 1}
                />
              ))}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      </div>

      {highlightPeak && peakIndex >= 0 && peakCaption && (
        <div
          className="mt-2 text-center"
          style={{ fontSize: 11, color: "var(--t-muted)" }}
        >
          {peakCaption(data[peakIndex])}
        </div>
      )}
    </div>
  );
}

/**
 * DualBarChart — пара серий рядом (например, Доходы/Расходы).
 */
export interface DualBarDatum {
  label: string;
  a: number;
  b: number;
}
export interface DualBarChartProps {
  data: DualBarDatum[];
  height?: number;
  colorA?: string;
  colorB?: string;
  labelA?: string;
  labelB?: string;
  formatValue?: (v: number) => string;
  showYAxis?: boolean;
}
export function DualBarChart({
  data,
  height = 220,
  colorA = CHART_PAIR.income,
  colorB = CHART_PAIR.expense,
  labelA = "Доходы",
  labelB = "Расходы",
  formatValue,
  showYAxis = true,
}: DualBarChartProps) {
  const fmt = formatValue ?? ((v: number) =>
    new Intl.NumberFormat("ru-RU").format(v));
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} margin={{ top: 8, right: 8, left: showYAxis ? 0 : 8, bottom: 4 }}>
          <CartesianGrid {...CHART_GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ ...CHART_AXIS }}
            tickLine={false}
            axisLine={false}
          />
          {showYAxis && (
            <YAxis
              tick={{ ...CHART_AXIS }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmt(Number(v))}
              width={48}
            />
          )}
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,.06)" }}
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => [fmt(Number(value)), name === "a" ? labelA : labelB]}
          />
          <Bar dataKey="a" fill={colorA} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="b" fill={colorB} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default BarChart;
