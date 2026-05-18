"use client";

import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ProgressRing, type ProgressRingTone } from "./ProgressRing";

/**
 * GoalCard — карточка цели: ring (или иконка-плашка) + название + AmountText
 *           прогресс + остаток + срок.
 *
 *   • current / target — суммы (число, не отформатированное).
 *   • currency — для отображения текущей суммы (caller сам передаёт <AmountText/> при желании).
 *   • emoji — слева вместо ProgressRing, если ring=false.
 *   • dueLabel — текст срока ("до 30 сент.", "осталось 14 дн.", "просрочено").
 *   • dueTone — danger/warning/neutral для подкраски срока.
 *   • onClick — карточка кликабельна (вся).
 *
 * Не зависит от <AmountText> жёстко — caller сам собирает суммы и кладёт в `valueNode`.
 * Это даёт свободу формата (валюты, дробная часть, цвет).
 */

export interface GoalCardProps {
  /** Название цели — "Отпуск в Греции", "Подушка безопасности". */
  title: ReactNode;
  /** Эмодзи слева (если ring=false). */
  emoji?: ReactNode;
  /** Текущая накопленная сумма (число для прогресса). */
  current: number;
  /** Целевая сумма. */
  target: number;
  /** Готовый узел текущей суммы (<AmountText/>...). Если не задан — рендерим число. */
  currentNode?: ReactNode;
  /** Готовый узел целевой суммы. */
  targetNode?: ReactNode;

  /** Показывать ProgressRing слева. Если false — emoji-плашка. По умолчанию true. */
  ring?: boolean;
  ringSize?: number;
  ringTone?: ProgressRingTone;

  /** Срок: «до 30 сент.» / «осталось 14 дн.» / «просрочено». */
  dueLabel?: ReactNode;
  dueTone?: "neutral" | "warning" | "danger" | "success";

  onClick?: () => void;
  className?: string;
}

const DUE_TONE_COLOR = {
  neutral: "var(--t-muted)",
  warning: "var(--c-warning-ink)",
  danger:  "var(--c-danger-ink)",
  success: "var(--c-success-ink)",
} as const;

function fmt(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

export const GoalCard = forwardRef<HTMLElement, GoalCardProps>(function GoalCard(
  {
    title,
    emoji,
    current,
    target,
    currentNode,
    targetNode,
    ring = true,
    ringSize = 56,
    ringTone = "accent",
    dueLabel,
    dueTone = "neutral",
    onClick,
    className,
  },
  ref,
) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const isComplete = current >= target && target > 0;

  const Tag = onClick ? "button" : "article";

  return (
    <Tag
      // @ts-expect-error — generic ref
      ref={ref}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group/goal w-full flex items-center gap-3 text-left transition-colors",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        className,
      )}
      style={{
        padding: 14,
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 14,
      }}
    >
      {/* Leading: ring or emoji plate */}
      <div className="shrink-0">
        {ring ? (
          <ProgressRing
            value={current}
            max={target}
            size={ringSize}
            color={ringTone}
            ariaLabel={`Прогресс ${pct}%`}
            center={
              <span
                className="tabular"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontSize: ringSize >= 56 ? 13 : 11,
                  fontWeight: 700,
                  color: isComplete ? "var(--c-success-ink)" : "var(--t-primary)",
                  letterSpacing: "-0.01em",
                }}
              >
                {pct}%
              </span>
            }
          />
        ) : (
          <span
            aria-hidden
            className="inline-flex items-center justify-center"
            style={{
              width: ringSize,
              height: ringSize,
              borderRadius: 14,
              background: "var(--app-accent-weak)",
              fontSize: ringSize * 0.45,
              lineHeight: 1,
            }}
          >
            {emoji ?? "🎯"}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 flex flex-col" style={{ gap: 4 }}>
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <h3
            className="truncate"
            style={{
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "var(--t-primary)",
              lineHeight: 1.3,
            }}
          >
            {title}
          </h3>
          {dueLabel && (
            <span
              className="shrink-0 tabular"
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: DUE_TONE_COLOR[dueTone],
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dueLabel}
            </span>
          )}
        </div>
        <div
          className="flex items-baseline gap-1.5 tabular"
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 12.5,
            color: "var(--t-muted)",
          }}
        >
          <span style={{ color: isComplete ? "var(--c-success-ink)" : "var(--t-primary)", fontWeight: 600 }}>
            {currentNode ?? fmt(current)}
          </span>
          {target > 0 && (
            <>
              <span style={{ color: "var(--t-faint)" }}>/</span>
              <span>{targetNode ?? fmt(target)}</span>
              <span
                className="ml-auto"
                style={{ color: "var(--t-muted)", fontSize: 11 }}
              >
                осталось {fmt(Math.max(0, target - current))}
              </span>
            </>
          )}
        </div>
      </div>
    </Tag>
  );
});

export default GoalCard;
