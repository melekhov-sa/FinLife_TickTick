"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Returns true when an input is focused (keyboard likely open).
 * Includes safety reset — if stuck in "focused" state for >3s
 * without active focus, automatically resets.
 */
export function useKeyboardVisible(): boolean {
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const safetyTimer = useRef<number | undefined>(undefined);

  const resetIfStuck = useCallback(() => {
    // Check if there's actually a focused input right now
    const active = document.activeElement;
    const tag = active?.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
      setFocused(false);
    }
  }, []);

  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        if (safetyTimer.current !== undefined) window.clearTimeout(safetyTimer.current);
        setFocused(true);
        // Safety: reset after 3s if focusout never fires
        safetyTimer.current = window.setTimeout(resetIfStuck, 3000);
      }
    }

    function onFocusOut() {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      if (safetyTimer.current !== undefined) window.clearTimeout(safetyTimer.current);
      timer.current = window.setTimeout(() => setFocused(false), 400);
    }

    // Also listen for page visibility changes — if app comes back to foreground, reset
    function onVisibilityChange() {
      if (!document.hidden) {
        resetIfStuck();
      }
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      if (safetyTimer.current !== undefined) window.clearTimeout(safetyTimer.current);
    };
  }, [resetIfStuck]);

  return focused;
}
