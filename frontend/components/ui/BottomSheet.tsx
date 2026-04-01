"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

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
 * - Mobile: fullscreen bottom sheet, keyboard-safe
 * - Desktop: centered modal dialog
 */
export function BottomSheet({ open, onClose, title, footer, children, onSubmit }: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewportH, setViewportH] = useState<number | null>(null);

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Lock body scroll — full iOS-safe approach ────────────────────────────
  // position:fixed prevents background scroll even when keyboard opens
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPosition = body.style.position;
    const prevTop = body.style.top;
    const prevWidth = body.style.width;

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = prevOverflow;
      body.style.position = prevPosition;
      body.style.top = prevTop;
      body.style.width = prevWidth;
      body.style.overscrollBehavior = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // ── Visual Viewport tracking (iOS keyboard) ─────────────────────────────
  // When iOS keyboard opens, visualViewport shrinks. We track it to resize
  // the sheet so the footer stays visible above the keyboard.
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    function onResize() {
      if (!vv) return;
      setViewportH(vv.height);
    }

    onResize(); // set initial
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [open]);

  // ── Auto-scroll focused input into view (iOS keyboard) ──────────────────
  useEffect(() => {
    if (!open) return;
    function onFocusIn(e: FocusEvent) {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
        // Only scroll if the element is inside our sheet content
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

  const Wrapper = onSubmit ? "form" : "div";
  const wrapperProps = onSubmit ? { onSubmit } : {};

  // On mobile, limit sheet height to visual viewport (shrinks when keyboard opens)
  const mobileMaxH = viewportH ? `${viewportH}px` : "100dvh";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ height: viewportH ? `${viewportH}px` : "100dvh" }}
      onClick={handleOverlayClick}
    >
      <Wrapper
        {...wrapperProps}
        ref={sheetRef as React.Ref<HTMLFormElement & HTMLDivElement>}
        className={clsx(
          // Base
          "flex flex-col border shadow-2xl overflow-hidden",
          "bg-white dark:bg-[#1a1d23] border-slate-200 dark:border-white/[0.09]",
          // Mobile: bottom sheet, full width
          "w-full rounded-t-2xl",
          // Desktop: centered modal
          "md:max-w-md md:mx-4 md:rounded-2xl md:max-h-[85vh]",
        )}
        style={{ maxHeight: `calc(${mobileMaxH} - 24px)` }}
      >
        {/* Handle bar — mobile only */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/[0.15]" />
        </div>

        {/* Header — always fixed at top */}
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
          className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-6 py-4 md:py-5 space-y-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {children}
        </div>

        {/* Sticky footer — stays above keyboard */}
        {footer && (
          <div
            className="shrink-0 px-5 md:px-6 py-3 md:py-4 border-t border-slate-200 dark:border-white/[0.06]"
            style={{
              paddingBottom: viewportH && viewportH < (window?.innerHeight ?? 9999) * 0.85
                ? "12px"  /* keyboard open — no safe area needed */
                : "max(12px, env(safe-area-inset-bottom))",
            }}
          >
            {footer}
          </div>
        )}
      </Wrapper>
    </div>
  );
}
