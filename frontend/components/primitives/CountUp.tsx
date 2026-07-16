"use client";

/**
 * Число, которое «досчитывает» до значения: при появлении и при изменении.
 * Уважает prefers-reduced-motion (мгновенно ставит значение).
 */

import { useEffect, useRef, useState } from "react";

export function useCountUp(value: number, duration = 600): number {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = to;
    if (from === to) {
      setDisplay(to);
      return;
    }
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}

const defaultFormat = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);

export function CountUp({
  value,
  format,
  duration,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const v = useCountUp(value, duration);
  return <>{(format ?? defaultFormat)(v)}</>;
}
