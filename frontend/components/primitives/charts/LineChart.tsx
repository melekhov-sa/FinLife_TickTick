"use client";

import {
  ResponsiveContainer,
  LineChart as RLineChart,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  CHART_AXIS,
  CHART_GRID,
  CHART_PAIR,
  CHART_PALETTE,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  seriesColor,
} from "./chart-tokens";

/**
 * LineChart — гибкий линейный/area-график.
 *
 *   • series: [{ key, label, color?, type?: "line"|"area" }]
 *   • data: [{ x, [key]: number, ... }]
 *   • mode="area" — заливка под линией (для одной серии). Несколько серий — обычные линии.
 *
 * Tooltip, axis, grid — общий стиль из chart-tokens.
 */

export interface LineSeries {
  key: string;
  label?: string;
  color?: string;
}

export interface LineChartProps<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T[];
  xKey: keyof T & string;
  series: LineSeries[];
  height?: number;
  mode?: "line" | "area";
  showLegend?: boolean;
  showYAxis?: boolean;
  formatValue?: (v: number) => string;
}

export function LineChart<T extends Record<string, unknown> = Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 240,
  mode = "line",
  showLegend = false,
  showYAxis = true,
  formatValue,
}: LineChartProps<T>) {
  const fmt = formatValue ?? ((v: number) =>
    new Intl.NumberFormat("ru-RU").format(v));

  const isArea = mode === "area" && series.length === 1;

  const ChartTag = isArea ? AreaChart : RLineChart;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartTag data={data} margin={{ top: 8, right: 12, left: showYAxis ? 0 : 8, bottom: 4 }}>
          {isArea && (
            <defs>
              {series.map((s, i) => {
                const color = s.color ?? seriesColor(i);
                return (
                  <linearGradient id={`fl-area-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                );
              })}
            </defs>
          )}
          <CartesianGrid {...CHART_GRID} vertical={false} />
          <XAxis
            dataKey={xKey as string}
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
            contentStyle={CHART_TOOLTIP_STYLE}
            itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            formatter={(value, name) => {
              const s = series.find((x) => x.key === name);
              return [fmt(Number(value)), s?.label ?? name];
            }}
          />
          {showLegend && (
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "var(--t-secondary)" }}
            />
          )}
          {series.map((s, i) => {
            const color = s.color ?? seriesColor(i);
            return isArea ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#fl-area-${s.key})`}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label ?? s.key}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: color }}
                isAnimationActive={false}
              />
            );
          })}
        </ChartTag>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Sparkline — мини-линия без осей, для StatBlock-sub и компактных мест.
 */
export interface SparklineProps {
  data: number[];
  height?: number;
  color?: string;
  filled?: boolean;
  /** Направление автодетект цвета: первое→последнее значение. */
  autoColor?: boolean;
}

export function Sparkline({
  data,
  height = 28,
  color,
  filled = true,
  autoColor = false,
}: SparklineProps) {
  const resolvedColor = (() => {
    if (color) return color;
    if (autoColor && data.length > 1) {
      const start = data[0];
      const end = data[data.length - 1];
      return end >= start ? CHART_PAIR.income : CHART_PAIR.expense;
    }
    return CHART_PAIR.accent;
  })();

  const mapped = data.map((v, i) => ({ x: i, v }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {filled ? (
          <AreaChart data={mapped} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fl-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={resolvedColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={resolvedColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              dataKey="v"
              type="monotone"
              stroke={resolvedColor}
              strokeWidth={1.75}
              fill="url(#fl-spark)"
              isAnimationActive={false}
            />
          </AreaChart>
        ) : (
          <RLineChart data={mapped} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <Line
              dataKey="v"
              type="monotone"
              stroke={resolvedColor}
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </RLineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export { CHART_PALETTE, CHART_PAIR, seriesColor };

export default LineChart;
