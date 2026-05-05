"use client";

import { forwardRef, useMemo, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * AmountText
 *
 * Форматированное число с валютой. Caller сам несёт знак во value:
 *   value={50000}    → "50 000 ₽"
 *   value={-1200}    → "−1 200 ₽"
 *
 * Цвет — opt-in:
 *   colored                 — красит по знаку value (+ зелёный, − красный, 0 muted)
 *   color="success|danger|warning|neutral|muted" — явный контекст-цвет
 *
 * Без обоих пропов — нейтральный t-primary.
 */

export type AmountTextSize = "xs" | "sm" | "md" | "lg";
export type AmountTextShowSign = "auto" | "always" | "never";
export type AmountTextPrecision = 0 | 2 | "auto";
export type AmountTextColor = "success" | "danger" | "warning" | "neutral" | "muted";

export interface AmountTextProps {
  /** Знаковое число. Знак числа задаёт минус в выводе и (при `colored`) цвет. */
  value: number | string;
  /** ISO-код валюты. По умолчанию RUB. Символ резолвится из локального словаря — не через Intl.style:"currency" (символ ₽ позиционируется по-разному в браузерах). */
  currency?: string;
  /** Размер. Соответствует токенам: xs 11/14, sm 13/18, md 15/22, lg 22/30. */
  size?: AmountTextSize;
  /** Поведение знака. "auto" — показывать только минус. "always" — + и −. "never" — без знака. */
  showSign?: AmountTextShowSign;
  /** Дробная часть. 0 — без копеек, 2 — всегда 2 знака, "auto" — 2 только если ≠ 00. */
  precision?: AmountTextPrecision;
  /** Включить автоокраску по знаку value. */
  colored?: boolean;
  /** Явный цвет (имеет приоритет над `colored`). */
  color?: AmountTextColor;
  /** Префикс перед числом — например, ↔ или ≈ для переводов / приближённых сумм. */
  prefix?: ReactNode;
  /** Жирность. По умолчанию 600. */
  weight?: number;
  className?: string;
  style?: CSSProperties;
  /** Доступное описание для screen-reader. По умолчанию строится автоматически. */
  ariaLabel?: string;
}

const SIZE_TOKENS: Record<AmountTextSize, { fz: number; lh: number; gap: number }> = {
  xs: { fz: 11, lh: 14, gap: 2 },
  sm: { fz: 13, lh: 18, gap: 3 },
  md: { fz: 15, lh: 22, gap: 4 },
  lg: { fz: 22, lh: 30, gap: 6 },
};

/**
 * Локальный словарь символов валют. НЕ используем Intl.NumberFormat({style:"currency"}):
 * у RUB символ ₽ позиционируется по-разному в Chrome/Safari, локали и пробелы тоже плавают.
 * Для добавления валюты — расширь словарь.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KZT: "₸",
  BYN: "Br",
  UAH: "₴",
  TRY: "₺",
};

export function getCurrencySymbol(code?: string): string {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? code;
}

const COLOR_VAR: Record<AmountTextColor, string> = {
  success: "var(--c-success-ink, #059669)",
  danger:  "var(--c-danger-ink, #DC2626)",
  warning: "var(--c-warning-ink, #D97706)",
  neutral: "var(--t-primary)",
  muted:   "var(--t-muted)",
};

export const AmountText = forwardRef<HTMLSpanElement, AmountTextProps>(function AmountText(
  {
    value,
    currency = "RUB",
    size = "md",
    showSign = "auto",
    precision = 0,
    colored = false,
    color,
    prefix,
    weight = 600,
    className,
    style,
    ariaLabel,
  },
  ref,
) {
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  const isInvalid = Number.isNaN(num);
  const negative = !isInvalid && num < 0;
  const abs = isInvalid ? 0 : Math.abs(num);

  // precision → digits
  let minDigits = 0;
  let maxDigits = 0;
  if (precision === 2) {
    minDigits = 2;
    maxDigits = 2;
  } else if (precision === "auto") {
    const hasFrac = Math.round(abs * 100) % 100 !== 0;
    minDigits = hasFrac ? 2 : 0;
    maxDigits = 2;
  }

  const formatted = useMemo(() => {
    if (isInvalid) return "—";
    return new Intl.NumberFormat("ru-RU", {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }).format(abs);
  }, [abs, minDigits, maxDigits, isInvalid]);

  // sign char (минус через U+2212, плюс — обычный)
  let signChar = "";
  if (!isInvalid) {
    if (showSign === "auto" && negative) signChar = "−";
    else if (showSign === "always") signChar = negative ? "−" : "+";
    // "never" → ""
  }

  // resolve color
  let resolvedColor: string = COLOR_VAR.neutral;
  if (color) {
    resolvedColor = COLOR_VAR[color];
  } else if (colored && !isInvalid) {
    if (negative) resolvedColor = COLOR_VAR.danger;
    else if (num > 0) resolvedColor = COLOR_VAR.success;
    else resolvedColor = COLOR_VAR.muted;
  }

  const tok = SIZE_TOKENS[size];
  const symbol = getCurrencySymbol(currency);
  const isNeutral = resolvedColor === COLOR_VAR.neutral;

  // a11y label: "минус 1 234 рубля" — упрощённо: знак + число + код валюты
  const a11y =
    ariaLabel ??
    (isInvalid
      ? "сумма недоступна"
      : `${negative ? "минус " : showSign === "always" && !negative ? "плюс " : ""}${formatted} ${currency.toUpperCase()}`);

  return (
    <span
      ref={ref}
      aria-label={a11y}
      className={cn("tabular inline-flex items-baseline whitespace-nowrap", className)}
      style={{
        fontVariantNumeric: "tabular-nums",
        fontSize: tok.fz,
        lineHeight: `${tok.lh}px`,
        color: resolvedColor,
        fontWeight: weight,
        gap: tok.gap,
        ...style,
      }}
    >
      {prefix ? <span style={{ marginRight: tok.gap }}>{prefix}</span> : null}
      {signChar ? <span aria-hidden>{signChar}</span> : null}
      <span aria-hidden>{formatted}</span>
      <span
        aria-hidden
        style={{
          color: isNeutral ? "var(--t-muted)" : "currentColor",
          opacity: isNeutral ? 1 : 0.9,
        }}
      >
        {symbol}
      </span>
    </span>
  );
});

export default AmountText;
