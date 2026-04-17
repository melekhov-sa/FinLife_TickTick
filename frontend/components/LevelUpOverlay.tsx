"use client";

import { useEffect, useCallback, useRef } from "react";

interface Props {
  level: number;
  onDismiss: () => void;
}

// Particle config: emoji + animation name + delay (ms)
const PARTICLES: { emoji: string; anim: string; delay: number; size: string }[] = [
  { emoji: "✨", anim: "lu-p1",  delay: 180, size: "18px" },
  { emoji: "⭐", anim: "lu-p2",  delay: 200, size: "16px" },
  { emoji: "🌟", anim: "lu-p3",  delay: 220, size: "20px" },
  { emoji: "✨", anim: "lu-p4",  delay: 160, size: "14px" },
  { emoji: "⭐", anim: "lu-p5",  delay: 240, size: "18px" },
  { emoji: "🌟", anim: "lu-p6",  delay: 190, size: "16px" },
  { emoji: "✨", anim: "lu-p7",  delay: 210, size: "14px" },
  { emoji: "💛", anim: "lu-p8",  delay: 170, size: "16px" },
  { emoji: "🧡", anim: "lu-p9",  delay: 250, size: "18px" },
  { emoji: "💫", anim: "lu-p10", delay: 230, size: "20px" },
  { emoji: "⭐", anim: "lu-p11", delay: 200, size: "14px" },
  { emoji: "✨", anim: "lu-p12", delay: 260, size: "16px" },
];

export function LevelUpOverlay({ level, onDismiss }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  // Haptic feedback — pattern for level-up (notable and celebratory)
  useEffect(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([30, 60, 30, 60, 80, 80, 100]);
      }
    } catch {
      // vibrate not supported — ignore silently
    }
  }, []);

  // Escape key dismiss
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleDismiss]);

  // Focus trap — move focus to dismiss button
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    btnRef.current?.focus();
    return () => {
      prev?.focus();
    };
  }, []);

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Поздравление с новым уровнем"
      onClick={handleDismiss}
      className="levelup-backdrop-animated fixed inset-0 z-[300] flex items-center justify-center"
      style={{
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "levelup-backdrop-in 300ms ease-out forwards",
      }}
    >
      {/* Screen-edge glow vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(251,191,36,0.18) 100%)",
          animation: "levelup-vignette-pulse 3s ease-in-out infinite",
          zIndex: 0,
        }}
      />

      {/* Card — stop propagation so inner taps don't dismiss */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="levelup-card-animated relative flex flex-col items-center gap-5 px-8 py-10 rounded-3xl text-center select-none"
        style={{
          background: "rgba(15,20,35,0.96)",
          border: "1.5px solid rgba(251,191,36,0.35)",
          boxShadow:
            "0 0 0 1px rgba(251,191,36,0.1), 0 0 80px rgba(251,191,36,0.25), 0 0 160px rgba(251,191,36,0.1), 0 32px 64px rgba(0,0,0,0.5)",
          animation: "levelup-card-in 550ms cubic-bezier(0.34,1.56,0.64,1) forwards",
          maxWidth: "min(380px, 92vw)",
          zIndex: 1,
        }}
      >
        {/* Particles — absolute, centered */}
        <div
          aria-hidden="true"
          style={{ position: "absolute", top: "42%", left: "50%", pointerEvents: "none" }}
        >
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="levelup-particle"
              style={{
                position: "absolute",
                fontSize: p.size,
                animation: `${p.anim} 1100ms ease-out ${p.delay}ms both`,
              }}
            >
              {p.emoji}
            </span>
          ))}
        </div>

        {/* Crown */}
        <span
          className="levelup-crown-animated"
          aria-hidden="true"
          style={{
            fontSize: "clamp(56px, 14vw, 80px)",
            lineHeight: 1,
            animation: "levelup-crown 600ms cubic-bezier(0.34,1.56,0.64,1) 80ms both",
            display: "block",
            filter: "drop-shadow(0 0 16px rgba(251,191,36,0.7)) drop-shadow(0 0 32px rgba(251,191,36,0.4))",
          }}
        >
          👑
        </span>

        {/* "Новый уровень!" label */}
        <p
          className="font-bold tracking-tight"
          style={{
            fontSize: "var(--fs-title)",
            color: "#fbbf24",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          Новый уровень!
        </p>

        {/* Giant level number */}
        <p
          className="levelup-number-animated font-bold tabular-nums leading-none"
          style={{
            fontSize: "clamp(80px, 20vw, 120px)",
            color: "#ffffff",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            animation: "levelup-number-in 600ms cubic-bezier(0.34,1.56,0.64,1) 150ms both",
            textShadow:
              "0 0 40px rgba(251,191,36,0.6), 0 0 80px rgba(251,191,36,0.3)",
          }}
        >
          {level}
        </p>

        {/* Subtitle */}
        <p
          style={{
            fontSize: "var(--fs-body)",
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.4,
          }}
        >
          Уровень {level} разблокирован
        </p>

        {/* Dismiss button */}
        <button
          ref={btnRef}
          onClick={handleDismiss}
          className="levelup-btn-animated mt-2 font-semibold rounded-2xl transition-all active:scale-95"
          style={{
            fontSize: "var(--fs-body)",
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#000",
            padding: "12px 40px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(245,158,11,0.4), 0 2px 8px rgba(0,0,0,0.3)",
            animation: "levelup-btn-appear 400ms ease-out 500ms both",
            minWidth: "160px",
          }}
        >
          Отлично!
        </button>

        {/* Dismiss hint */}
        <p
          style={{
            fontSize: "var(--fs-caption)",
            color: "rgba(255,255,255,0.25)",
            marginTop: "-8px",
          }}
        >
          Нажмите вне окна чтобы закрыть<span className="hint-esc-only"> · Esc</span>
        </p>
      </div>
    </div>
  );
}
