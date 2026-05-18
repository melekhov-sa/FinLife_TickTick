"use client";

import { forwardRef, type ReactNode, type CSSProperties } from "react";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WidgetShellProps {
  icon?: ReactNode;
  title?: ReactNode;
  /** Slot справа в шапке (фильтры, переключатели) — скрывается в edit-mode. */
  headerActions?: ReactNode;

  /** Включает drag-handle и кнопку удаления. */
  editMode?: boolean;
  /** Удалить виджет. Кнопка ✕ показывается только при editMode + onRemove. */
  onRemove?: () => void;

  /** Skeleton вместо body. */
  loading?: boolean;
  /** Минимальная высота карточки. */
  minHeight?: number;
  /** Скрыть шапку целиком. */
  hideHeader?: boolean;
  /** false — body без отступов (для графиков край-в-край). */
  bodyPadded?: boolean;

  /** Drop-target подсветка (для dnd). */
  isOver?: boolean;
  /** Виджет тащится — пониженная opacity. */
  isDragging?: boolean;

  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ariaLabel?: string;
}

export const Widget = forwardRef<HTMLElement, WidgetShellProps>(function Widget(
  {
    icon,
    title,
    headerActions,
    editMode = false,
    onRemove,
    loading = false,
    minHeight = 160,
    hideHeader = false,
    bodyPadded = true,
    isOver = false,
    isDragging = false,
    className,
    style,
    children,
    ariaLabel,
  },
  ref,
) {
  const showClose = editMode && !!onRemove;
  const showHeaderActions = !editMode && !!headerActions;

  return (
    <section
      ref={ref}
      aria-label={ariaLabel}
      className={cn("group/widget relative flex flex-col overflow-hidden transition-shadow", className)}
      style={{
        minHeight,
        background: "var(--app-card-bg)",
        border: `1px solid ${isOver ? "var(--app-accent)" : "var(--app-border)"}`,
        borderRadius: 16,
        boxShadow: isDragging
          ? "0 16px 32px -12px rgba(0,0,0,.18), 0 4px 12px -4px rgba(0,0,0,.10)"
          : "0 1px 2px rgba(16,24,40,.04)",
        opacity: isDragging ? 0.7 : 1,
        ...style,
      }}
    >
      {!hideHeader && (
        <header
          className="shrink-0 flex items-center gap-2 px-4"
          style={{ height: 44, borderBottom: "1px solid var(--app-border)" }}
        >
          {/* drag-handle: widget-drag-handle class is picked up by react-grid-layout */}
          {editMode && (
            <span
              role="button"
              aria-label="Перетащить виджет"
              className="widget-drag-handle shrink-0 inline-flex items-center justify-center cursor-grab active:cursor-grabbing -ml-1 touch-none rounded-md transition-colors hover:bg-[var(--app-border)]"
              style={{ width: 24, height: 24, color: "var(--t-faint)" }}
            >
              <GripVertical size={14} strokeWidth={1.75} />
            </span>
          )}

          {icon != null && (
            <span
              aria-hidden
              className="shrink-0 inline-flex items-center justify-center"
              style={{ width: 20, height: 20, fontSize: 14 }}
            >
              {icon}
            </span>
          )}

          {title != null && (
            <h3
              className="min-w-0 truncate flex-1"
              style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em", color: "var(--t-primary)" }}
            >
              {title}
            </h3>
          )}

          {showHeaderActions && (
            <div className="shrink-0 flex items-center gap-1.5 ml-auto">{headerActions}</div>
          )}

          {showClose && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Удалить виджет"
              className="shrink-0 inline-flex items-center justify-center ml-auto rounded-md transition-colors hover:bg-[var(--app-border)]"
              style={{ width: 24, height: 24, color: "var(--t-muted)" }}
            >
              <X size={14} strokeWidth={1.9} />
            </button>
          )}
        </header>
      )}

      <div
        className={cn("flex-1 min-h-0", bodyPadded && "p-4")}
        style={{ overflow: "hidden" }}
      >
        {loading ? <WidgetSkeleton /> : children}
      </div>
    </section>
  );
});

function WidgetSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse p-4">
      <div style={{ height: 14, width: "40%", background: "var(--c-neutral-bg)", borderRadius: 4 }} />
      <div style={{ height: 28, width: "65%", background: "var(--c-neutral-bg)", borderRadius: 6 }} />
      <div style={{ height: 10, width: "100%", background: "var(--c-neutral-bg)", borderRadius: 999 }} />
      <div style={{ height: 80, width: "100%", background: "var(--c-neutral-bg)", borderRadius: 8 }} />
    </div>
  );
}

export default Widget;
