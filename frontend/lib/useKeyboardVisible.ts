"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Detects when nav should be hidden:
 * - Input/textarea is focused (keyboard likely open)
 * - Body position is fixed (modal scroll lock active)
 *
 * Uses only focus events — no MutationObserver or visualViewport
 * listeners (those cause infinite rerender loops on iOS PWA).
 */
export function useKeyboardVisible(): boolean {
  const [hidden, setHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function show() {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Check if modal is open (body scroll locked)
      if (document.body.style.position === "fixed") {
        setHidden(true);
        return;
      }
      setHidden(false);
    }

    function onFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setHidden(true);
      }
    }

    function onFocusOut() {
      // Delay — iOS keyboard takes ~300ms to dismiss
      timerRef.current = setTimeout(show, 400);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    // Periodic check for modal state (every 500ms, lightweight)
    const interval = setInterval(() => {
      const modalOpen = document.body.style.position === "fixed";
      setHidden(prev => {
        if (modalOpen && !prev) return true;
        if (!modalOpen && prev && document.activeElement?.tagName !== "INPUT"
            && document.activeElement?.tagName !== "TEXTAREA"
            && document.activeElement?.tagName !== "SELECT") return false;
        return prev;
      });
    }, 500);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(interval);
    };
  }, []);

  return hidden;
}
