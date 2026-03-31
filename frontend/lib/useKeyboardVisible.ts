"use client";

import { useState, useEffect } from "react";

/**
 * Detects iOS/Android virtual keyboard by comparing visualViewport
 * height to window.innerHeight. Returns true when keyboard is visible.
 * Also returns true when any modal/bottom-sheet is open (body overflow hidden).
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function check() {
      // Method 1: visualViewport shrink (iOS keyboard)
      const vv = window.visualViewport;
      if (vv && vv.height < window.innerHeight * 0.75) {
        setVisible(true);
        return;
      }

      // Method 2: body scroll locked = modal open
      if (document.body.style.position === "fixed") {
        setVisible(true);
        return;
      }

      setVisible(false);
    }

    // Check on focus/blur of inputs
    function onFocusIn(e: FocusEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Delay to let iOS keyboard animate
        setTimeout(check, 300);
      }
    }

    function onFocusOut() {
      setTimeout(check, 100);
    }

    // VisualViewport resize (primary signal on iOS)
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", check);

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    // MutationObserver for body style changes (modal open/close)
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });

    return () => {
      if (vv) vv.removeEventListener("resize", check);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      observer.disconnect();
    };
  }, []);

  return visible;
}
