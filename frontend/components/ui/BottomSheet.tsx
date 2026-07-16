"use client";

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}

/**
 * Unified modal component:
 * - Mobile: bottom sheet anchored to bottom, always shows dark overlay at top
 * - Desktop: centered modal dialog
 * Rendered via createPortal into document.body to escape any stacking context.
 */
export function BottomSheet({ open, onClose, title, footer, children, onSubmit }: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Шит, прибитый к низу layout viewport, уезжает под iOS-клавиатуру —
  // поднимаем на kbInset (см. useKeyboardInset).
  const { inset: kbInset, vvHeight: viewportH } = useKeyboardInset(open);

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Lock body scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevOverflow;
    };
  }, [open]);

  // ── Auto-scroll focused input into view (iOS keyboard) ──────────────────
  useEffect(() => {
    if (!open) return;
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        if (contentRef.current?.contains(el)) {
          setTimeout(() => {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 350);
        }
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [open]);

  // ── Overlay click ────────────────────────────────────────────────────────
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const Wrapper = onSubmit ? "form" : "div";
  const wrapperProps = onSubmit ? { onSubmit } : {};

  // On mobile: paddingTop leaves 56px of dark overlay visible at the top so the
  // user sees modal context. When keyboard opens (kbInset > 0), remove it to
  // give the sheet maximum space; paddingBottom lifts the sheet above the
  // keyboard (layout viewport doesn't shrink on iOS — visualViewport does).
  const isMobile = window.innerWidth < 768;
  const overlayPaddingTop = kbInset > 0 ? 0 : isMobile ? 56 : 0;

  const modal = (
    <div
      ref={overlayRef}
      className="modal-overlay fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm animate-overlay-fade"
      style={{ paddingTop: overlayPaddingTop, paddingBottom: kbInset }}
      onClick={handleOverlayClick}
    >
      <Wrapper
        {...wrapperProps}
        ref={sheetRef as React.Ref<HTMLFormElement & HTMLDivElement>}
        className={clsx(
          "flex flex-col border shadow-2xl overflow-hidden animate-sheet-up",
          "bg-[var(--app-sheet-bg,#fff)] border-slate-200 dark:border-white/[0.09]",
          // Mobile: bottom sheet, full width
          "w-full rounded-t-2xl",
          // Desktop: centered modal
          "md:max-w-xl md:mx-4 md:rounded-2xl md:max-h-[85vh]",
        )}
        style={{
          maxHeight:
            kbInset > 0 && viewportH
              ? `${viewportH - 12}px`
              : "calc(100dvh - 24px)",
        }}
      >
        {/* Handle bar — mobile only, slightly darker for visibility */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-400/60 dark:bg-white/25" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-6 pt-2 md:pt-5 pb-3 md:pb-4 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
          <h2 className="text-[15px] md:text-base font-semibold text-slate-800 dark:text-white/90" style={{ letterSpacing: "-0.02em" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] flex items-center justify-center text-slate-400 dark:text-white/50 hover:text-slate-600 dark:hover:text-white/70 hover:bg-slate-200 dark:hover:bg-white/[0.07] active:bg-slate-300 dark:active:bg-white/[0.1] transition-colors touch-manipulation"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-6 py-3 md:py-5 space-y-3 touch-manipulation"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div
            className="shrink-0 px-5 md:px-6 py-3 md:py-4 border-t border-slate-200 dark:border-white/[0.06]"
            style={{
              // при открытой клавиатуре safe-area не нужен — индикатор скрыт
              paddingBottom: kbInset > 0 ? "12px" : "max(16px, env(safe-area-inset-bottom, 0px))",
            }}
          >
            {footer}
          </div>
        )}
      </Wrapper>
    </div>
  );

  return createPortal(modal, document.body);
}
