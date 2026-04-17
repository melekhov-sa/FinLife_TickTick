"use client";

import { useEffect, useCallback } from "react";

const MILESTONE_MESSAGES: Record<number, string> = {
  7:   "Неделя подряд!",
  14:  "Две недели подряд!",
  30:  "Месяц подряд!",
  60:  "Два месяца подряд!",
  100: "100 дней — это сила!",
  200: "200 дней — легенда!",
  365: "Целый год! Это невероятно!",
};

function streakLabel(n: number): string {
  if (n === 1) return "1 день подряд";
  if (n >= 5 && n <= 20) return `${n} дней подряд`;
  const last = n % 10;
  if (last === 1) return `${n} день подряд`;
  if (last >= 2 && last <= 4) return `${n} дня подряд`;
  return `${n} дней подряд`;
}

interface Props {
  streak: number | null;
  onDismiss: () => void;
}

export function MilestoneOverlay({ streak, onDismiss }: Props) {
  const visible = streak !== null;

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // Auto-dismiss after 1.5s
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(handleDismiss, 1500);
    return () => clearTimeout(t);
  }, [visible, handleDismiss]);

  // Escape key dismiss
  useEffect(() => {
    if (!visible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, handleDismiss]);

  if (!visible || streak === null) return null;

  const message = MILESTONE_MESSAGES[streak] ?? `${streakLabel(streak)} — отлично!`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поздравление с рекордом серии"
      onClick={handleDismiss}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      {/* Overlay content — suppress click so it doesn't accidentally close on inner tap */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col items-center gap-4 px-8 py-10 rounded-3xl text-center select-none"
        style={{
          background: "rgba(17,24,39,0.92)",
          border: "1px solid rgba(251,191,36,0.25)",
          boxShadow: "0 0 60px rgba(251,191,36,0.15), 0 24px 48px rgba(0,0,0,0.4)",
          animation: "milestone-in 350ms cubic-bezier(0.34,1.56,0.64,1) forwards",
          maxWidth: "min(340px, 90vw)",
        }}
      >
        {/* Flame emoji with burst animation */}
        <span
          style={{
            fontSize: "64px",
            lineHeight: 1,
            animation: "flame-burst 500ms cubic-bezier(0.34,1.56,0.64,1) 50ms both",
            display: "block",
          }}
          aria-hidden="true"
        >
          🔥
        </span>

        {/* Particles */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", top: "50%", left: "50%", pointerEvents: "none" }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                fontSize: "16px",
                animation: `particle-fly-${i} 800ms ease-out 200ms both`,
              }}
            >
              {i % 2 === 0 ? "✨" : "⭐"}
            </span>
          ))}
        </div>

        {/* Streak number */}
        <p
          className="font-bold tabular-nums leading-none"
          style={{
            fontSize: "var(--fs-hero)",
            color: "var(--t-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          {streakLabel(streak)}
        </p>

        {/* Congratulation message */}
        <p
          className="font-semibold"
          style={{
            fontSize: "var(--fs-title)",
            color: "#fbbf24",
            lineHeight: 1.3,
          }}
        >
          {message}
        </p>

        {/* Dismiss hint */}
        <p
          style={{
            fontSize: "var(--fs-caption)",
            color: "rgba(255,255,255,0.35)",
            marginTop: "4px",
          }}
        >
          Нажмите чтобы закрыть<span className="hint-esc-only"> · Esc</span>
        </p>
      </div>
    </div>
  );
}

export const MILESTONE_STREAKS = new Set([7, 14, 30, 60, 100, 200, 365]);
