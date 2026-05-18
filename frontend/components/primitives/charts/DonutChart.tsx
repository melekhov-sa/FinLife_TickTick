"use client";

import { useMemo, type ReactNode } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import {
  CHART_PALETTE,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  seriesColor,
} from "./chart-tokens";

/**
 * DonutChart — обвязка над recharts <PieChart>.
 *
 *   • Сортирует data по value (крупнейший сегмент первым).
 *   • Центр-надпись: caption (uppercase 11px) + total (большое число).
 *   • Палитра — CHART_PALETTE (можно переопределить colors=[]).
 *   • Tooltip — единый стиль из chart-tokens.
 *
 * Не рисует легенду — её caller кладёт рядом (так компактнее и контроль формата).
 * Никаких overlay-абсолютов на сегментах.
 */

export interface DonutDatum {
  name: string;
  value: number;
  color?: string;
}

export interface DonutChartProps {
  data: DonutDatum[];
  /** Палитра. По умолчанию — CHART_PALETTE. */
  colors?: readonly string[];
  /** Подпись над числом в центре (uppercase). */
  caption?: ReactNode;
  /** Само число в центре. Если не задано — сумма data[].value. */
  total?: ReactNode;
  /** Форматирование значения в tooltip. */
  formatValue?: (v: number, d: DonutDatum) => string;
  /** Внешний радиус кольца. По умолчанию 100% (заполняет контейнер). */
  outerRadius?: number | string;
  /** Внутренний радиус. По умолчанию 70% от outerRadius. */
  innerRadius?: number | string;
  /** Высота контейнера. По умолчанию 240px. */
  height?: number;
  /** Сортировать ли по value. По умолчанию true. */
  sort?: boolean;
  /** Масштабный коэффициент для шрифтов центральной надписи. */
  scale?: number;
}

export function DonutChart({
  data,
  colors = CHART_PALETTE,
  caption,
  total,
  formatValue,
  outerRadius = "100%",
  innerRadius = "70%",
  height = 240,
  sort = true,
  scale = 1,
}: DonutChartProps) {
  const sortedData = useMemo(() => {
    if (!sort) return data;
    return [...data].sort((a, b) => b.value - a.value);
  }, [data, sort]);

  const sum = useMemo(
    () => sortedData.reduce((acc, d) => acc + d.value, 0),
    [sortedData],
  );

  const fmt = formatValue ?? ((v: number) =>
    new Intl.NumberFormat("ru-RU").format(v));

  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={sortedData}
            dataKey="value"
            nameKey="name"
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            paddingAngle={1.5}
            stroke="var(--app-card-bg)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {sortedData.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? (colors[i % colors.length] ?? seriesColor(i))} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            cursor={false}
            formatter={(value, name, payload) => {
              const v = Number(value);
              const pct = sum > 0 ? ((v / sum) * 100).toFixed(1) : "0";
              return [`${fmt(v, payload.payload as DonutDatum)} · ${pct}%`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {(caption != null || total != null) && (
        <div
          className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center"
        >
          {caption != null && (
            <div
              style={{
                fontSize: Math.round(11 * scale),
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--t-muted)",
                marginBottom: 4,
              }}
            >
              {caption}
            </div>
          )}
          <div
            className="tabular"
            style={{
              fontVariantNumeric: "tabular-nums",
              fontSize: Math.round(22 * scale),
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--t-primary)",
              lineHeight: 1.1,
            }}
          >
            {total ?? fmt(sum, sortedData[0] ?? { name: "", value: sum })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DonutChart;
