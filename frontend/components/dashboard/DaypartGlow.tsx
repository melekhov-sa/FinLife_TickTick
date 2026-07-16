"use client";

/**
 * Атмосфера времени суток на дашборде: тонкое свечение в верхней части.
 * Утро — тёплое, день — небесное, вечер — фиолетовое, ночь — приглушённое.
 * Рендерится после маунта (часы клиента ≠ часы сервера — избегаем гидрации).
 */

import { useEffect, useState } from "react";

function gradientFor(hour: number): string {
  if (hour >= 5 && hour < 11)
    return "radial-gradient(ellipse 90% 75% at 50% -20%, rgba(251,146,60,0.13), transparent 62%)";
  if (hour >= 11 && hour < 17)
    return "radial-gradient(ellipse 90% 75% at 50% -20%, rgba(56,189,248,0.10), transparent 62%)";
  if (hour >= 17 && hour < 22)
    return "radial-gradient(ellipse 90% 75% at 50% -20%, rgba(129,140,248,0.16), transparent 62%)";
  return "radial-gradient(ellipse 90% 75% at 50% -20%, rgba(99,102,241,0.09), transparent 62%)";
}

export function DaypartGlow() {
  const [grad, setGrad] = useState<string | null>(null);
  useEffect(() => {
    setGrad(gradientFor(new Date().getHours()));
  }, []);
  if (!grad) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-72 -z-10"
      style={{ background: grad }}
    />
  );
}
