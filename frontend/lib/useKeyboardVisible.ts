"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Returns true when an input is focused (keyboard likely open).
 * Minimal — no MutationObserver, no visualViewport, no intervals.
 */
export function useKeyboardVisible(): boolean {
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        setFocused(true);
      }
    }

    function onFocusOut() {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setFocused(false), 400);
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    };
  }, []);

  return focused;
}
