"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hapticTick } from "@/lib/native";

/**
 * Горизонтальный свайп по контенту листает вкладки-маршруты
 * (как в App Store). Свайп влево → следующая, вправо → предыдущая.
 *
 * Не срабатывает: от левой кромки (там жест меню/назад), при открытом
 * шите, внутри горизонтально скроллящихся контейнеров.
 */
export function useTabSwipe(tabs: string[], currentId: string): void {
  const router = useRouter();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const insideHScroll = (target: EventTarget | null): boolean => {
      let node = target instanceof HTMLElement ? target : null;
      while (node) {
        if (node.scrollWidth > node.clientWidth + 4) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === "auto" || overflowX === "scroll") return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= 32) return; // кромка — чужой жест
      if (document.querySelector(".modal-overlay")) return;
      if (insideHScroll(e.target)) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (Math.abs(dx) < 72 || Math.abs(dx) < dy * 1.6) return;
      const idx = tabs.indexOf(currentId);
      if (idx === -1) return;
      const next = dx < 0 ? idx + 1 : idx - 1;
      if (next < 0 || next >= tabs.length) return;
      void hapticTick();
      router.push(tabs[next]);
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [tabs, currentId, router]);
}
