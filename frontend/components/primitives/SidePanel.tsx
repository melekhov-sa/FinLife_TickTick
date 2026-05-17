"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * SidePanel — универсальная детальная панель.
 *
 * Один компонент вместо четырёх дублей
 * (TaskDetailPanel / HabitDetailPanel / EventDetailPanel / SubscriptionDetailPanel).
 *
 * Поведение:
 *   • open=false → ничего не рендерится (без `display: none`).
 *   • Escape и клик по backdrop → onClose().
 *   • Body-scroll-lock пока панель открыта.
 *   • Desktop (≥ 1024px): правая панель 400px, slide-in справа (translateX 100% → 0).
 *   • Mobile (< 1024px): bottom sheet, top: 15%, slide-in снизу (translateY 100% → 0).
 *   • Backdrop fade-in.
 *
 * Слоты:
 *   • header — фиксированная шапка (иконка + title + close-кнопка снаружи компонента).
 *   • footer — фиксированный футер с действиями.
 *   • children — скроллируемая зона (flex-1 + overflow-auto).
 *
 * Никаких новых CSS-переменных — используются --app-card-bg, --app-border, --t-primary.
 * Keyframes объявлены inline в этом же файле, не лезут в globals.css.
 */

export interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Ширина desktop-панели. По умолчанию 400px. */
  width?: number;
  /** ARIA-label для контейнера панели. */
  ariaLabel?: string;
}

export function SidePanel({
  open,
  onClose,
  header,
  footer,
  children,
  className,
  width = 400,
  ariaLabel,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof window === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[60]"
      role="presentation"
      onClick={onClose}
      style={{ animation: "fl-sp-overlay .15s ease-out" }}
    >
      {/* backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "rgba(8, 12, 20, .42)" }}
      />

      {/* panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "fl-sp",
          // mobile: bottom sheet
          "fixed left-0 right-0 bottom-0 top-[15%] rounded-t-2xl",
          // desktop overrides: right-aligned full-height panel
          "lg:left-auto lg:right-0 lg:top-0 lg:bottom-0 lg:rounded-none",
          "flex flex-col overflow-hidden",
          className,
        )}
        style={{
          background: "var(--app-card-bg)",
          borderLeft: "1px solid var(--app-border)",
          boxShadow:
            "0 24px 64px -16px rgba(0,0,0,.5), 0 8px 20px -8px rgba(0,0,0,.2)",
          ["--fl-sp-w" as string]: `${width}px`,
          animation: "fl-sp-in-mobile .22s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        {header && (
          <div
            className="shrink-0 px-5 py-4 flex items-center justify-between gap-3"
            style={{ borderBottom: "1px solid var(--app-border)" }}
          >
            {header}
          </div>
        )}

        <div
          className="flex-1 overflow-auto"
          style={{ background: "var(--app-card-bg)" }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="shrink-0 px-5 py-3 flex items-center justify-end gap-2"
            style={{
              borderTop: "1px solid var(--app-border)",
              background: "var(--app-card-bg)",
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fl-sp-overlay {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes fl-sp-in-mobile {
          from { transform: translateY(100%) }
          to   { transform: translateY(0) }
        }
        @keyframes fl-sp-in-desktop {
          from { transform: translateX(100%) }
          to   { transform: translateX(0) }
        }
        @media (min-width: 1024px) {
          .fl-sp {
            width: var(--fl-sp-w, 400px);
            animation: fl-sp-in-desktop .22s cubic-bezier(.22,.61,.36,1) !important;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

export default SidePanel;
