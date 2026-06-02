"use client";

import { useState, useEffect } from "react";

/**
 * true, когда экранная клавиатура реально открыта.
 * Детект по visualViewport — единственный надёжный сигнал на iOS
 * (и в Safari, и в standalone-PWA). Без ложных срабатываний от фокуса.
 */
export function useKeyboardVisible(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // старый браузер — просто не прячем

    // standalone-PWA при запуске 500мс устаканивает вьюпорт — игнорируем в это время
    const mountedAt = Date.now();

    let raf = 0;
    const measure = () => {
      // разница между layout-viewport и видимой областью
      // > 120px = клавиатура (не адресная строка / жесты)
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setOpen(gap > 120 && Date.now() - mountedAt > 500);
    };
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    measure();

    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
      cancelAnimationFrame(raf);
    };
  }, []);

  return open;
}
