"use client";

import { forwardRef, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * DateChip
 *
 * Дата с семантической раскраской. Buckets:
 *   overdue   — просрочено (красный)
 *   today     — сегодня (синий)
 *   tomorrow  — завтра (янтарный)
 *   thisWeek  — в течение недели (нейтральный)
 *   later     — позднее (без фона, muted)
 *   done      — выполнено (зелёный, переопределяет всё)
 *
 * Сам считает bucket из (date, now). Caller передаёт только дату и (опционально) флаг done.
 * Формат подписи — относительный: "Сегодня", "Завтра", "Вчера", "12 мая", "пн" внутри недели.
 */

export type DateChipSize = "sm" | "md";
export type DateChipBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "done";

export interface DateChipProps {
  /** Дата задачи / платежа. Принимает Date или ISO-строку. */
  date: Date | string | number;
  /** Точка отсчёта. По умолчанию — new Date() в момент рендера. */
  now?: Date;
  /** Если задача выполнена — bucket принудительно становится "done". */
  done?: boolean;
  size?: DateChipSize;
  /** Иконка календаря слева. */
  withIcon?: boolean;
  /** Кастомная подпись вместо рассчитанной. Bucket остаётся семантическим. */
  label?: string;
  /** Принудительно задать bucket (когда контекст знает лучше — например, "просрочено по статусу", а не по дате). */
  bucket?: DateChipBucket;
  className?: string;
  title?: string;
}

const BUCKET_TOKENS: Record<
  DateChipBucket,
  { bg: string; fg: string; ink: string }
> = {
  overdue:  { bg: "var(--c-danger-bg)",  fg: "var(--c-danger-fg)",  ink: "var(--c-danger-ink)"  },
  today:    { bg: "var(--c-info-bg)",    fg: "var(--c-info-fg)",    ink: "var(--c-info-ink)"    },
  tomorrow: { bg: "var(--c-warning-bg)", fg: "var(--c-warning-fg)", ink: "var(--c-warning-ink)" },
  thisWeek: { bg: "var(--c-neutral-bg)", fg: "var(--c-neutral-fg)", ink: "var(--c-neutral-ink)" },
  later:    { bg: "transparent",         fg: "var(--t-muted)",      ink: "var(--t-muted)"       },
  done:     { bg: "var(--c-success-bg)", fg: "var(--c-success-fg)", ink: "var(--c-success-ink)" },
};

const SIZE: Record<DateChipSize, { padX: number; padY: number; fz: number; icon: number }> = {
  sm: { padX: 6, padY: 1, fz: 11, icon: 10 },
  md: { padX: 8, padY: 2, fz: 12, icon: 11 },
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86400000);
}

export function getDateBucket(date: Date, now: Date, done = false): DateChipBucket {
  if (done) return "done";
  const d = diffDays(date, now);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 7) return "thisWeek";
  return "later";
}

export function formatRelativeDate(date: Date, now: Date): string {
  const d = diffDays(date, now);
  if (d === 0) return "Сегодня";
  if (d === 1) return "Завтра";
  if (d === -1) return "Вчера";
  if (d > 1 && d < 7) {
    return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
  }
  if (d < 0) {
    if (d > -7) return `${Math.abs(d)} дн. назад`;
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}

export const DateChip = forwardRef<HTMLSpanElement, DateChipProps>(function DateChip(
  { date, now, done = false, size = "md", withIcon = false, label, bucket, className, title },
  ref,
) {
  const dt = useMemo(() => (date instanceof Date ? date : new Date(date)), [date]);
  const ref_now = useMemo(() => now ?? new Date(), [now]);
  const isInvalid = Number.isNaN(dt.getTime());

  const resolvedBucket: DateChipBucket = bucket ?? (isInvalid ? "later" : getDateBucket(dt, ref_now, done));
  const tok = BUCKET_TOKENS[resolvedBucket];
  const sz = SIZE[size];
  const text = label ?? (done ? "Сделано" : isInvalid ? "—" : formatRelativeDate(dt, ref_now));

  return (
    <span
      ref={ref}
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-md whitespace-nowrap", className)}
      style={{
        padding: `${sz.padY}px ${sz.padX}px`,
        background: tok.bg,
        color: tok.fg,
        fontSize: sz.fz,
        fontWeight: 600,
        letterSpacing: "-0.005em",
      }}
    >
      {withIcon && (
        <svg
          width={sz.icon}
          height={sz.icon}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={{ color: tok.ink }}
        >
          <path
            d="M8 2v4M16 2v4M3.5 9.5h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span>{text}</span>
    </span>
  );
});

export default DateChip;
