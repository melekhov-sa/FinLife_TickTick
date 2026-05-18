"use client";

import { forwardRef, type ReactNode, type CSSProperties } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWidgetScale } from "./ScaleContext";

export type StatBlockSize = "hero" | "regular" | "compact";
export type StatBlockTone = "neutral" | "success" | "danger" | "muted";
export type StatBlockDeltaTrend = "up" | "down" | "flat" | "auto";

export interface StatBlockDelta {
  label: ReactNode;
  trend?: StatBlockDeltaTrend;
  hint?: ReactNode;
}

export interface StatBlockProps {
  label?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  delta?: StatBlockDelta;
  size?: StatBlockSize;
  tone?: StatBlockTone;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

const SIZE = {
  hero:    { labelFz: 11, valueFz: 30, subFz: 12, deltaFz: 12, gap: 6, valueGap: 8 },
  regular: { labelFz: 11, valueFz: 22, subFz: 12, deltaFz: 12, gap: 4, valueGap: 6 },
  compact: { labelFz: 10, valueFz: 18, subFz: 11, deltaFz: 11, gap: 3, valueGap: 5 },
} as const;

const TONE_COLOR: Record<StatBlockTone, string> = {
  neutral: "var(--t-primary)",
  success: "var(--c-success-ink)",
  danger:  "var(--c-danger-ink)",
  muted:   "var(--t-muted)",
};

function detectTrend(label: ReactNode): StatBlockDeltaTrend {
  if (typeof label !== "string") return "flat";
  const trimmed = label.trim();
  if (trimmed.startsWith("+")) return "up";
  if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "down";
  return "flat";
}

export const StatBlock = forwardRef<HTMLDivElement, StatBlockProps>(function StatBlock(
  {
    label,
    value,
    sub,
    delta,
    size = "regular",
    tone = "neutral",
    icon,
    className,
    style,
    ariaLabel,
  },
  ref,
) {
  const scale = useWidgetScale();
  const base = SIZE[size];
  const tok = {
    labelFz:  base.labelFz  * scale,
    valueFz:  base.valueFz  * scale,
    subFz:    base.subFz    * scale,
    deltaFz:  base.deltaFz  * scale,
    gap:      base.gap      * scale,
    valueGap: base.valueGap * scale,
  };
  const valueColor = TONE_COLOR[tone];

  const trend = delta
    ? delta.trend === "auto" || !delta.trend
      ? detectTrend(delta.label)
      : delta.trend
    : "flat";

  const deltaPalette =
    trend === "up"
      ? { fg: "var(--c-success-ink)", Icon: TrendingUp }
      : trend === "down"
        ? { fg: "var(--c-danger-ink)", Icon: TrendingDown }
        : { fg: "var(--t-muted)", Icon: Minus };

  const DeltaIcon = deltaPalette.Icon;

  return (
    <div
      ref={ref}
      aria-label={ariaLabel}
      className={cn("flex flex-col min-w-0", className)}
      style={{ gap: tok.gap, ...style }}
    >
      {label != null && (
        <div
          className="inline-flex items-center"
          style={{
            gap: 6,
            fontSize: tok.labelFz,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--t-muted)",
            lineHeight: 1,
          }}
        >
          {icon && (
            <span aria-hidden style={{ display: "inline-flex", color: "currentColor" }}>
              {icon}
            </span>
          )}
          <span className="truncate">{label}</span>
        </div>
      )}

      <div
        className="flex items-baseline min-w-0"
        style={{ gap: tok.valueGap }}
      >
        <span
          className="tabular truncate"
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: tok.valueFz,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: valueColor,
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>

        {delta && (
          <span
            className="inline-flex items-center shrink-0 tabular"
            style={{
              gap: 3,
              fontSize: tok.deltaFz,
              fontWeight: 600,
              color: deltaPalette.fg,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <DeltaIcon size={tok.deltaFz + 1} strokeWidth={2} />
            <span>{delta.label}</span>
            {delta.hint && (
              <span
                style={{
                  color: "var(--t-muted)",
                  fontWeight: 500,
                  marginLeft: 2,
                }}
              >
                {delta.hint}
              </span>
            )}
          </span>
        )}
      </div>

      {sub != null && (
        <div
          className="truncate"
          style={{
            fontSize: tok.subFz,
            color: "var(--t-muted)",
            lineHeight: 1.4,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
});

export default StatBlock;
