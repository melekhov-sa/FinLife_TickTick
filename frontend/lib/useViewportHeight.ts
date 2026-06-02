"use client";
import { useEffect } from "react";

/**
 * Привязывает CSS-переменную --app-height к visualViewport.height.
 * Когда открыта клавиатура (iOS), приложение сжимается над ней,
 * а не уезжает вверх.
 * Также скроллит активное поле в центр видимой области при фокусе.
 */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport;

    const set = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", h + "px");
      // гасим попытку iOS проскроллить body под фикс-контейнером
      window.scrollTo(0, 0);
    };

    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      // 300мс — клавиатура успевает появиться и visualViewport обновиться
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    };

    set();
    vv?.addEventListener("resize", set);
    vv?.addEventListener("scroll", set);
    document.addEventListener("focusin", onFocus);

    return () => {
      vv?.removeEventListener("resize", set);
      vv?.removeEventListener("scroll", set);
      document.removeEventListener("focusin", onFocus);
    };
  }, []);
}
