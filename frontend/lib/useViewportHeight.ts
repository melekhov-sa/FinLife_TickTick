"use client";
import { useEffect } from "react";

/** Scrolls the focused input into the visible area when the iOS keyboard opens. */
export function useViewportHeight() {
  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
}
