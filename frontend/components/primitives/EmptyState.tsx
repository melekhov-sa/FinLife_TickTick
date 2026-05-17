"use client";

import { forwardRef, type ReactNode } from "react";
import { AlertOctagon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — универсальный компонент для пустых и ошибочных состояний.
 *
 *   variant="empty"  → дружелюбный: эмодзи в индиго-плашке (по умолчанию ✨)
 *   variant="error"  → нейтрально-тревожный: lucide-иконка в красноватой плашке
 *
 *   size="lg"  → page-level (вся страница пуста), padding 80px
 *   size="md"  → card-level (внутри карточки), padding 40px
 *   size="sm"  → inline (под фильтром «ничего не найдено»), padding 20px
 *
 *   action  — один primary CTA (label + onClick + optional icon)
 *   actions — слот для редких случаев двух+ кнопок (имеет приоритет над action)
 */

export type EmptyStateVariant = "empty" | "error";
export type EmptyStateSize = "lg" | "md" | "sm";

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  size?: EmptyStateSize;
  /** Эмодзи для variant="empty". По умолчанию "✨". */
  emoji?: string;
  /** Lucide-иконка для variant="error". По умолчанию <AlertOctagon/>. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Один primary CTA. */
  action?: { label: ReactNode; onClick: () => void; icon?: ReactNode };
  /** Слот для нескольких кнопок. Имеет приоритет над action. */
  actions?: ReactNode;
  className?: string;
}

const TOKENS: Record<
  EmptyStateSize,
  {
    padY: number;
    padX: number;
    plate: number;
    plateRad: number;
    emojiFz: number;
    iconSize: number;
    titleFz: number;
    descFz: number;
    descMaxW: number;
    gap: number;
    btnH: number;
    btnPx: number;
    btnFz: number;
  }
> = {
  lg: { padY: 80, padX: 24, plate: 80, plateRad: 24, emojiFz: 44, iconSize: 32, titleFz: 18, descFz: 14,   descMaxW: 380, gap: 20, btnH: 40, btnPx: 18, btnFz: 14   },
  md: { padY: 40, padX: 20, plate: 64, plateRad: 20, emojiFz: 36, iconSize: 26, titleFz: 16, descFz: 13.5, descMaxW: 320, gap: 14, btnH: 36, btnPx: 14, btnFz: 13.5 },
  sm: { padY: 20, padX: 16, plate: 44, plateRad: 14, emojiFz: 22, iconSize: 18, titleFz: 14, descFz: 12.5, descMaxW: 280, gap: 10, btnH: 32, btnPx: 12, btnFz: 13   },
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    variant = "empty",
    size = "md",
    emoji,
    icon,
    title,
    description,
    action,
    actions,
    className,
  },
  ref,
) {
  const tok = TOKENS[size];

  const plate =
    variant === "error"
      ? { bg: "var(--c-danger-bg)", fg: "var(--c-danger-ink)" }
      : { bg: "var(--app-accent-weak)", fg: "var(--app-accent-ink)" };

  const illustration =
    variant === "empty" ? (
      emoji ? (
        <span style={{ fontSize: tok.emojiFz, lineHeight: 1 }}>{emoji}</span>
      ) : icon ? (
        <span style={{ color: plate.fg, display: "inline-flex" }}>{icon}</span>
      ) : (
        <span style={{ fontSize: tok.emojiFz, lineHeight: 1 }}>✨</span>
      )
    ) : (
      <span style={{ color: plate.fg, display: "inline-flex" }}>
        {icon ?? <AlertOctagon size={tok.iconSize} strokeWidth={1.75} />}
      </span>
    );

  return (
    <div
      ref={ref}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn("flex flex-col items-center text-center", className)}
      style={{ padding: `${tok.padY}px ${tok.padX}px` }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center shrink-0"
        style={{
          width: tok.plate,
          height: tok.plate,
          borderRadius: tok.plateRad,
          background: plate.bg,
        }}
      >
        {illustration}
      </span>

      <h3
        style={{
          marginTop: tok.gap,
          fontSize: tok.titleFz,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--t-primary)",
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>

      {description && (
        <p
          style={{
            marginTop: 6,
            maxWidth: tok.descMaxW,
            fontSize: tok.descFz,
            color: "var(--t-muted)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      )}

      {(action || actions) && (
        <div
          className="flex items-center justify-center gap-2"
          style={{ marginTop: tok.gap }}
        >
          {actions ? (
            actions
          ) : (
            <button
              type="button"
              onClick={action!.onClick}
              className="inline-flex items-center font-medium transition-colors"
              style={{
                height: tok.btnH,
                padding: `0 ${tok.btnPx}px`,
                borderRadius: 10,
                background:
                  variant === "error" ? "var(--app-card-bg)" : "var(--app-accent)",
                color: variant === "error" ? "var(--t-primary)" : "#FFFFFF",
                border:
                  variant === "error"
                    ? "1px solid var(--app-border)"
                    : "1px solid transparent",
                fontSize: tok.btnFz,
                gap: 6,
              }}
            >
              {action!.icon}
              {action!.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default EmptyState;
