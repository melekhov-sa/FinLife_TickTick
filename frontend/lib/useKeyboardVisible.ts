"use client";
import { useState, useEffect } from "react";

export function useKeyboardVisible(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const mountedAt = Date.now();
    let raf = 0;
    const measure = () => {
      const el = document.activeElement;
      const editing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      const gap = window.innerHeight - vv.height;
      setOpen(editing && gap > 120 && Date.now() - mountedAt > 500);
    };
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    vv.addEventListener("resize", onResize);
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", measure);
    measure();
    return () => {
      vv.removeEventListener("resize", onResize);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("focusout", measure);
      cancelAnimationFrame(raf);
    };
  }, []);
  return open;
}
