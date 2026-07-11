"use client";

import { forwardRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CategoryPill
 *
 * Семантическая обёртка над визуальным языком "категория" (эмодзи + название).
 * Один стиль для всех мест: фильтр в шапке, чип в строке операции, селект в форме.
 *
 * Намеренно НЕ использует Chip напрямую — у Chip-а другие визуальные намерения
 * (уменьшенная высота, фокус-кольца под фильтр-бар), а CategoryPill часто живёт
 * inline внутри строк, и ему нужны более «лёгкие» отступы.
 */

export type CategoryPillSize = "sm" | "md";
export type CategoryPillVariant = "soft" | "outline" | "bare";

export interface CategoryPillProps {
  /** Эмодзи категории. Если категория без эмодзи — передай "•" или специальный символ. */
  emoji?: ReactNode;
  /** Название категории. */
  name: ReactNode;
  size?: CategoryPillSize;
  variant?: CategoryPillVariant;
  /** Состояние выбора (для фильтра). */
  selected?: boolean;
  onClick?: () => void;
  /** Кнопка ✕ внутри пилюли. */
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
}

const SIZE: Record<CategoryPillSize, { padX: number; padY: number; fz: number; emoji: number; remove: number }> = {
  sm: { padX: 8, padY: 2, fz: 11.5, emoji: 13, remove: 9 },
  md: { padX: 10, padY: 3, fz: 12.5, emoji: 15, remove: 10 },
};

export const CategoryPill = forwardRef<HTMLButtonElement, CategoryPillProps>(function CategoryPill(
  {
    emoji,
    name,
    size = "md",
    variant = "soft",
    selected = false,
    onClick,
    onRemove,
    className,
    disabled,
    title,
  },
  ref,
) {
  const isInteractive = Boolean(onClick) || Boolean(onRemove);
  const tok = SIZE[size];

  // Token-based palette — те же CSS-переменные, что у Badge/Chip/AmountText
  const skin =
    variant === "soft"
      ? selected
        ? { bg: "var(--app-accent-weak)", fg: "var(--app-accent-ink)", border: "transparent" }
        : { bg: "var(--c-neutral-bg)",   fg: "var(--t-secondary)",     border: "transparent" }
      : variant === "outline"
        ? selected
          ? { bg: "transparent", fg: "var(--app-accent-ink)", border: "var(--app-accent)" }
          : { bg: "transparent", fg: "var(--t-secondary)",    border: "var(--app-border)" }
        : { bg: "transparent", fg: "var(--t-secondary)", border: "transparent" };

  const Tag: "button" | "span" = onClick ? "button" : "span";

  return (
    <Tag
      ref={ref}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick ? selected : undefined}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full select-none transition-colors",
        isInteractive && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]",
        onClick && !disabled && "hover:opacity-90 active:scale-[.97]",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
      style={{
        padding: `${tok.padY}px ${tok.padX}px`,
        fontSize: tok.fz,
        fontWeight: 500,
        background: skin.bg,
        color: skin.fg,
        border: `1px solid ${skin.border}`,
        letterSpacing: "-0.01em",
      }}
    >
      {emoji != null && (
        <span aria-hidden style={{ fontSize: tok.emoji, lineHeight: 1 }}>
          {emoji}
        </span>
      )}
      <span className="whitespace-nowrap">{name}</span>
      {onRemove && (
        <span
          role="button"
          aria-label="Убрать категорию"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }
          }}
          className="ml-0.5 inline-flex items-center justify-center rounded-full opacity-60 hover:opacity-100 cursor-pointer"
          style={{ width: tok.remove + 4, height: tok.remove + 4 }}
        >
          <X size={tok.remove} />
        </span>
      )}
    </Tag>
  );
});

export default CategoryPill;
