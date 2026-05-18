"use client";

/**
 * Heatmap — единая «карта привычек» / activity heatmap.
 *
 *   • cells: массив { date: ISO, value: number, label?: string }
 *   • Группирует по неделям (понедельник = начало недели, ru-RU).
 *   • Цвет — линейная интерполяция между bg-цветом и accent (5 ступеней).
 *   • Tooltip на hover: дата + значение + label.
 *   • Над сеткой — подписи месяцев (опц.), слева — дни недели (опц.).
 *
 * Не управляет загрузкой/пустотой — caller сам рендерит EmptyState/Skeleton.
 */

import { useMemo, useState, type ReactNode } from "react";

export interface HeatmapCell {
  /** ISO-дата YYYY-MM-DD (без времени). */
  date: string;
  /** Значение — определяет интенсивность цвета. */
  value: number;
  /** Кастомная подпись для tooltip (вместо value). */
  label?: ReactNode;
}

export interface HeatmapProps {
  cells: HeatmapCell[];
  /** Количество недель (по умолчанию 26 ≈ полгода). */
  weeks?: number;
  /** Сколько ступеней градиента. По умолчанию 5. */
  levels?: number;
  /** Финальная дата справа. По умолчанию сегодня. */
  endDate?: Date;
  /** Размер ячейки в px. По умолчанию 12. */
  cellSize?: number;
  /** Расстояние между ячейками. По умолчанию 3. */
  gap?: number;
  /** Базовый цвет ячейки (level 0). По умолчанию --c-neutral-bg. */
  baseColor?: string;
  /** Акцент (level max). По умолчанию --app-accent. */
  accentColor?: string;
  /** Показывать дни недели слева. По умолчанию true. */
  showWeekdays?: boolean;
  /** Показывать подписи месяцев сверху. По умолчанию true. */
  showMonths?: boolean;
  /** Показать легенду снизу. По умолчанию true. */
  showLegend?: boolean;
  /** Форматирование tooltip-строки. */
  formatTooltip?: (cell: HeatmapCell) => ReactNode;
  className?: string;
}

const WEEKDAY_LABELS = ["Пн", "", "Ср", "", "Пт", "", "Вс"]; // показываем через одну
const MONTH_LABELS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** День недели (0 = Пн ... 6 = Вс). */
function ruWeekday(d: Date): number {
  const jsDay = d.getDay(); // 0 = Sun
  return jsDay === 0 ? 6 : jsDay - 1;
}

function colorForLevel(level: number, levels: number, base: string, accent: string): string {
  if (level <= 0) return base;
  if (level >= levels) return accent;
  const pct = Math.round((level / levels) * 100);
  return `color-mix(in oklab, ${accent} ${pct}%, ${base})`;
}

export function Heatmap({
  cells,
  weeks = 26,
  levels = 5,
  endDate,
  cellSize = 12,
  gap = 3,
  baseColor = "var(--c-neutral-bg)",
  accentColor = "var(--app-accent)",
  showWeekdays = true,
  showMonths = true,
  showLegend = true,
  formatTooltip,
  className,
}: HeatmapProps) {
  const cellMap = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    for (const c of cells) m.set(c.date, c);
    return m;
  }, [cells]);

  const maxValue = useMemo(() => {
    return cells.reduce((acc, c) => (c.value > acc ? c.value : acc), 0);
  }, [cells]);

  const grid = useMemo(() => {
    const end = startOfDay(endDate ?? new Date());
    // выравниваем end на воскресенье текущей недели (последний день столбца)
    const endWd = ruWeekday(end); // 0..6
    const lastDay = new Date(end);
    lastDay.setDate(end.getDate() + (6 - endWd));

    const totalDays = weeks * 7;
    const firstDay = new Date(lastDay);
    firstDay.setDate(lastDay.getDate() - (totalDays - 1));

    const cols: Array<Array<{ date: Date; iso: string; cell?: HeatmapCell }>> = [];
    for (let w = 0; w < weeks; w++) {
      const col: Array<{ date: Date; iso: string; cell?: HeatmapCell }> = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(firstDay);
        dt.setDate(firstDay.getDate() + w * 7 + d);
        const iso = isoDate(dt);
        col.push({ date: dt, iso, cell: cellMap.get(iso) });
      }
      cols.push(col);
    }
    return { cols, firstDay, lastDay };
  }, [cellMap, endDate, weeks]);

  const monthLabels = useMemo(() => {
    let prevMonth = -1;
    return grid.cols.map((col, i) => {
      const m = col[0].date.getMonth();
      const show = m !== prevMonth && i > 0;
      prevMonth = m;
      return show ? MONTH_LABELS[m] : "";
    });
  }, [grid.cols]);

  const [hover, setHover] = useState<{
    iso: string;
    x: number;
    y: number;
    cell?: HeatmapCell;
    date: Date;
  } | null>(null);

  const colWidth = cellSize + gap;
  const rowHeight = cellSize + gap;
  const leftPad = showWeekdays ? 28 : 0;
  const topPad = showMonths ? 16 : 0;
  const width = leftPad + weeks * colWidth - gap;
  const height = topPad + 7 * rowHeight - gap;

  return (
    <div className={className}>
      <div
        className="relative"
        style={{ width, height, fontSize: 10 }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Month labels */}
        {showMonths && monthLabels.map((label, i) =>
          label ? (
            <span
              key={`m-${i}`}
              className="absolute select-none"
              style={{
                left: leftPad + i * colWidth,
                top: 0,
                fontSize: 10,
                fontWeight: 500,
                color: "var(--t-muted)",
              }}
            >
              {label}
            </span>
          ) : null
        )}

        {/* Weekday labels */}
        {showWeekdays && WEEKDAY_LABELS.map((label, i) =>
          label ? (
            <span
              key={`wd-${i}`}
              className="absolute select-none"
              style={{
                left: 0,
                top: topPad + i * rowHeight - 1,
                fontSize: 10,
                fontWeight: 500,
                color: "var(--t-muted)",
              }}
            >
              {label}
            </span>
          ) : null
        )}

        {/* Cells */}
        {grid.cols.map((col, ci) =>
          col.map((slot, ri) => {
            const value = slot.cell?.value ?? 0;
            const level = maxValue > 0
              ? Math.ceil((value / maxValue) * levels)
              : 0;
            const bg = colorForLevel(level, levels, baseColor, accentColor);
            return (
              <div
                key={slot.iso}
                onMouseEnter={() =>
                  setHover({
                    iso: slot.iso,
                    x: leftPad + ci * colWidth + cellSize / 2,
                    y: topPad + ri * rowHeight,
                    cell: slot.cell,
                    date: slot.date,
                  })
                }
                style={{
                  position: "absolute",
                  left: leftPad + ci * colWidth,
                  top: topPad + ri * rowHeight,
                  width: cellSize,
                  height: cellSize,
                  background: bg,
                  borderRadius: 3,
                  cursor: slot.cell ? "default" : undefined,
                  transition: "transform 80ms",
                }}
              />
            );
          })
        )}

        {/* Tooltip */}
        {hover && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: hover.x,
              top: hover.y - 4,
              transform: "translate(-50%, -100%)",
              padding: "6px 9px",
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              boxShadow:
                "0 8px 24px -8px rgba(0,0,0,.18), 0 2px 6px -2px rgba(0,0,0,.10)",
              fontSize: 11,
              color: "var(--t-primary)",
              whiteSpace: "nowrap",
              zIndex: 5,
            }}
          >
            {formatTooltip ? formatTooltip(hover.cell ?? { date: hover.iso, value: 0 })
              : (
                <>
                  <div style={{ fontWeight: 600 }}>
                    {hover.date.toLocaleDateString("ru-RU", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </div>
                  <div style={{ color: "var(--t-muted)", marginTop: 2 }}>
                    {hover.cell ? `${hover.cell.label ?? hover.cell.value}` : "—"}
                  </div>
                </>
              )}
          </div>
        )}
      </div>

      {showLegend && (
        <div
          className="flex items-center gap-1.5 mt-3"
          style={{ fontSize: 11, color: "var(--t-muted)" }}
        >
          <span>Меньше</span>
          {Array.from({ length: levels + 1 }).map((_, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: colorForLevel(i, levels, baseColor, accentColor),
              }}
            />
          ))}
          <span>Больше</span>
        </div>
      )}
    </div>
  );
}

export default Heatmap;
