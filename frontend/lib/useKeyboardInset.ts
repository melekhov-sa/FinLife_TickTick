"use client";

import { useEffect, useState } from "react";

/**
 * Высота iOS-клавиатуры поверх layout viewport.
 *
 * На iOS при открытии клавиатуры layout viewport НЕ сжимается — сжимается
 * только visualViewport. Элементы, прибитые к низу (bottom sheet), уезжают
 * под клавиатуру. `inset` — на сколько поднять; `vvHeight` — видимая высота.
 */
export function useKeyboardInset(active: boolean = true) {
  const [inset, setInset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setVvHeight(vv.height);
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);

  return { inset, vvHeight };
}
