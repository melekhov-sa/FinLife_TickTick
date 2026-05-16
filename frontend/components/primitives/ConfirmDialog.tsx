"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ConfirmDialog
 *
 * Центрированный mini-dialog для подтверждений. НЕ заменяет полноценные формы
 * (для них — отдельный Dialog/Sheet).
 *
 * Поведение:
 *   • Esc / клик вне модалки / кнопка X — закрывают (вызывают onCancel)
 *   • Десктоп (≥ 640px): кнопки в ряд справа — [Отмена] [Действие]
 *   • Мобиле (< 640px): вертикальный стек, primary сверху:
 *       [  Действие  ]   ← full-width
 *       [  Отмена    ]   ← full-width
 *     (стандарт iOS HIG: палец снизу безопасно попадает в Cancel)
 *   • `destructive` делает действие красным
 *   • Анимации: backdrop fade-in, dialog scale+slide-in
 *
 * Использует Portal на document.body (если есть window).
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Скрыть X в углу. */
  hideClose?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  destructive = false,
  onConfirm,
  onCancel,
  hideClose = false,
}: ConfirmDialogProps) {
  const dlgRef = useRef<HTMLDivElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Autofocus confirm
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open || typeof window === "undefined") return null;

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(8, 12, 20, .45)",
        animation: "fl-overlay-in .15s ease-out",
      }}
      onClick={onCancel}
      aria-modal="true"
      role="presentation"
    >
      <div
        ref={dlgRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fl-confirm-title"
        aria-describedby={description ? "fl-confirm-desc" : undefined}
        onClick={(e) => e.stopPropagation()}
        className="relative"
        style={{
          width: 380,
          maxWidth: "100%",
          background: "var(--app-card-bg)",
          borderRadius: 16,
          border: "1px solid var(--app-border)",
          boxShadow:
            "0 24px 64px -16px rgba(0,0,0,.5), 0 8px 20px -8px rgba(0,0,0,.2)",
          padding: 20,
          animation: "fl-dlg-in .18s cubic-bezier(.22,.61,.36,1)",
        }}
      >
        {!hideClose && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Закрыть"
            className="absolute top-3 right-3 inline-flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--t-muted)",
            }}
          >
            <X size={14} strokeWidth={1.9} />
          </button>
        )}

        <h2
          id="fl-confirm-title"
          style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--t-primary)",
            paddingRight: hideClose ? 0 : 28,
            marginBottom: 6,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h2>

        {description && (
          <p
            id="fl-confirm-desc"
            style={{
              fontSize: 13.5,
              color: "var(--t-muted)",
              lineHeight: 1.5,
              marginBottom: 18,
            }}
          >
            {description}
          </p>
        )}

        {/* Buttons — desktop row + mobile stack via CSS class */}
        <div
          className={cn(
            "fl-confirm-actions mt-2",
            // Desktop: row, end-aligned, cancel first
            "flex sm:flex-row sm:items-center sm:justify-end sm:gap-2",
            // Mobile: column, primary first (DOM order matches)
            "flex-col-reverse gap-2 sm:gap-2",
          )}
        >
          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="fl-confirm-btn"
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 10,
              border: "1px solid var(--app-border)",
              background: "var(--app-card-bg)",
              color: "var(--t-secondary)",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            {cancelLabel}
          </button>
          {/* Confirm */}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={onConfirm}
            className="fl-confirm-btn"
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 10,
              border: "1px solid transparent",
              background: destructive
                ? "var(--c-danger-ink)"
                : "var(--app-accent)",
              color: "white",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      {/* keyframes + responsive width — single style tag */}
      <style>{`
        @keyframes fl-overlay-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fl-dlg-in { from { transform: scale(.96) translateY(8px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
        @media (max-width: 639.98px) {
          [role="dialog"][aria-modal="true"] { width: 320px !important; }
          .fl-confirm-actions .fl-confirm-btn { width: 100% }
        }
      `}</style>
    </div>
  );

  return createPortal(node, document.body);
}

export default ConfirmDialog;
