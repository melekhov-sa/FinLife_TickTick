"use client";

import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { clsx } from "clsx";

export interface BottomSheetProps {
  /** Controls visibility */
  open: boolean;
  /** Called when the sheet requests to close (overlay tap, X, Escape) */
  onClose: () => void;
  /** Header title */
  title: string;
  /** Optional sticky footer content (e.g. submit button row) */
  footer?: React.ReactNode;
  /** Form content */
  children: React.ReactNode;
  /** Optional: wrap children in a <form> with this onSubmit */
  onSubmit?: (e: React.FormEvent) => void;
}

export function BottomSheet({ open, onClose, title, footer, children, onSubmit }: BottomSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Handle overlay click (only the backdrop itself, not children)
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  if (!open) return null;

  const Wrapper = onSubmit ? "form" : "div";
  const wrapperProps = onSubmit ? { onSubmit } : {};

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <Wrapper
        {...wrapperProps}
        className={clsx(
          // Base
          "flex flex-col bg-[#1a1d23] border border-white/[0.09] shadow-2xl overflow-hidden",
          // Mobile: bottom sheet
          "w-full max-h-[92vh] rounded-t-2xl",
          // Desktop: centered modal
          "md:max-w-md md:mx-4 md:rounded-2xl md:max-h-[85vh]",
        )}
      >
        {/* Handle bar — mobile only */}
        <div className="md:hidden flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/[0.15]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-6 pt-2 md:pt-5 pb-3 md:pb-4 border-b border-white/[0.06] shrink-0">
          <h2 className="text-[15px] md:text-base font-semibold text-white/90" style={{ letterSpacing: "-0.02em" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/50 hover:text-white/70 hover:bg-white/[0.07] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 md:px-6 py-4 md:py-5 space-y-4"
        >
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div
            className="shrink-0 px-5 md:px-6 py-3 md:py-4 border-t border-white/[0.06]"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </Wrapper>
    </div>
  );
}
