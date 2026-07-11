"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { subscribeToCompletions, type CompletionEvent } from "@/lib/completionFeedback";
import { hapticSuccess } from "@/lib/native";

// ── Constants ─────────────────────────────────────────────────────────────────

const MILESTONE_BIG = new Set([30, 50, 100, 200, 365]);
const CONFETTI_KEY = "finlife_confetti_date";

const CONFETTI_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#f97316", "#14b8a6",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface XpFloat {
  id: number;
  xp: number;
  removing: boolean;
}

interface ToastMsg {
  id: number;
  text: string;
  emoji: string;
  removing: boolean;
}

interface MilestoneState {
  streak: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _id = 0;
function nextId() { return ++_id; }

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isFirstTaskToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(CONFETTI_KEY);
    const today = todayISO();
    if (stored === today) return false;
    localStorage.setItem(CONFETTI_KEY, today);
    return true;
  } catch {
    return false;
  }
}

function makeConfettiParticles(count = 60) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    x: 30 + Math.random() * 40,        // % from left
    delay: Math.random() * 400,          // ms
    dur: 1200 + Math.random() * 800,     // ms
    tx: (Math.random() - 0.5) * 340,     // px horizontal drift
    ty: 180 + Math.random() * 260,       // px downward
    rot: (Math.random() - 0.5) * 720,    // degrees
    size: 5 + Math.random() * 6,         // px
    shape: Math.random() > 0.5 ? "circle" : "rect" as "circle" | "rect",
  }));
}

// ── Milestone Modal ───────────────────────────────────────────────────────────

function MilestoneModal({ streak, onDismiss }: { streak: number; onDismiss: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onDismiss(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  useEffect(() => {
    try { navigator.vibrate?.([30, 50, 30, 50, 80]); } catch { /* ignore */ }
  }, []);

  const emoji = streak >= 100 ? "🏆" : streak >= 50 ? "💎" : "🔥";
  const label = streak >= 365 ? "Целый год!" : streak >= 100 ? "Легенда!" : streak >= 50 ? "Невероятно!" : "Отлично!";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(8px)",
        animation: "cfb-backdrop 300ms ease-out forwards",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "rgba(15,20,35,0.97)",
          border: "1.5px solid rgba(239,68,68,0.4)",
          borderRadius: 28,
          padding: "40px 48px",
          textAlign: "center",
          maxWidth: "min(360px, 92vw)",
          boxShadow: "0 0 80px rgba(239,68,68,0.2), 0 32px 64px rgba(0,0,0,0.5)",
          animation: "cfb-card 500ms cubic-bezier(0.34,1.56,0.64,1) forwards",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }}
      >
        <span style={{ fontSize: 72, lineHeight: 1, filter: "drop-shadow(0 0 20px rgba(239,68,68,0.6))" }}>
          {emoji}
        </span>
        <p style={{ color: "#ef4444", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {label}
        </p>
        <p style={{ color: "#fff", fontWeight: 800, fontSize: 72, lineHeight: 1, letterSpacing: "-0.04em" }}>
          {streak}
        </p>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, lineHeight: 1.4 }}>
          {streak === 365 ? "365 дней подряд — целый год!" : `${streak} дней подряд без пропуска`}
        </p>
        <button
          onClick={onDismiss}
          autoFocus
          style={{
            marginTop: 8,
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            padding: "12px 40px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
          }}
        >
          Продолжаю!
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── Main layer ────────────────────────────────────────────────────────────────

export function CompletionFeedbackLayer() {
  const [xpFloats, setXpFloats] = useState<XpFloat[]>([]);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [milestone, setMilestone] = useState<MilestoneState | null>(null);
  const [confetti, setConfetti] = useState<ReturnType<typeof makeConfettiParticles> | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const removeXpFloat = useCallback((id: number) => {
    setXpFloats((prev) => prev.map((f) => f.id === id ? { ...f, removing: true } : f));
    setTimeout(() => setXpFloats((prev) => prev.filter((f) => f.id !== id)), 400);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, removing: true } : t));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 400);
  }, []);

  useEffect(() => {
    return subscribeToCompletions((event: CompletionEvent) => {
      // ── Нативная хаптика (Capacitor; в браузере — no-op) ────────────────────
      void hapticSuccess();

      // ── XP float ────────────────────────────────────────────────────────────
      if (event.xp_gained > 0) {
        const id = nextId();
        setXpFloats((prev) => [...prev.slice(-4), { id, xp: event.xp_gained, removing: false }]);
        setTimeout(() => removeXpFloat(id), 1600);
      }

      // ── Task-specific feedback ───────────────────────────────────────────────
      if (event.type === "task" && event.task_ctx) {
        const ctx = event.task_ctx;

        // Confetti for first task of day
        if (isFirstTaskToday()) {
          const particles = makeConfettiParticles(55);
          setConfetti(particles);
          setTimeout(() => setConfetti(null), 2800);
        }

        // Toast: early completion
        if (ctx.is_early && ctx.days_early >= 1) {
          const id = nextId();
          const text = ctx.days_early === 1
            ? "На день раньше срока"
            : `На ${ctx.days_early} дня раньше срока`;
          setToasts((prev) => [...prev.slice(-2), { id, text, emoji: "⚡", removing: false }]);
          setTimeout(() => removeToast(id), 3000);
        }

        // Toast: long overdue task finally done
        if (ctx.days_overdue >= 7) {
          const id = nextId();
          setToasts((prev) => [...prev.slice(-2), {
            id,
            text: `Висела ${ctx.days_overdue} дней — наконец-то!`,
            emoji: "💪",
            removing: false,
          }]);
          setTimeout(() => removeToast(id), 3500);
        }
      }

      // ── Habit-specific feedback ──────────────────────────────────────────────
      if (event.type === "habit" && event.habit_ctx) {
        const ctx = event.habit_ctx;

        if (ctx.is_milestone) {
          if (MILESTONE_BIG.has(ctx.streak)) {
            // Full-screen overlay for big milestones
            setMilestone({ streak: ctx.streak });
          } else {
            // Toast for smaller milestones (7, 14, 21)
            const id = nextId();
            setToasts((prev) => [...prev.slice(-2), {
              id,
              text: `${ctx.streak} дней подряд!`,
              emoji: "🔥",
              removing: false,
            }]);
            setTimeout(() => removeToast(id), 3000);
          }
        }
      }
    });
  }, [removeXpFloat, removeToast]);

  if (!mounted) return null;

  return (
    <>
      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes cfb-backdrop { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cfb-card { from { opacity: 0; transform: scale(0.85) } to { opacity: 1; transform: scale(1) } }
        @keyframes cfb-xp-in { from { opacity: 0; transform: translateY(8px) scale(0.8) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cfb-xp-out { from { opacity: 1; transform: translateY(0) } to { opacity: 0; transform: translateY(-18px) } }
        @keyframes cfb-toast-in { from { opacity: 0; transform: translateY(-10px) scale(0.95) } to { opacity: 1; transform: translateY(0) scale(1) } }
        @keyframes cfb-toast-out { from { opacity: 1; transform: translateY(0) scale(1) } to { opacity: 0; transform: translateY(-8px) scale(0.95) } }
        @keyframes cfb-confetti { from { transform: translate(0, -20px) rotate(0deg); opacity: 1; } to { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)); opacity: 0; } }
      `}</style>

      {/* XP floats — bottom right */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed", bottom: 80, right: 20, zIndex: 500,
          display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
          pointerEvents: "none",
        }}
      >
        {xpFloats.map((f) => (
          <div
            key={f.id}
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))",
              border: "1px solid rgba(99,102,241,0.3)",
              borderRadius: 20,
              padding: "5px 12px",
              backdropFilter: "blur(8px)",
              animation: f.removing
                ? "cfb-xp-out 350ms ease-in forwards"
                : "cfb-xp-in 250ms cubic-bezier(0.34,1.56,0.64,1) forwards",
            }}
          >
            <span style={{
              fontWeight: 700, fontSize: 13, letterSpacing: "-0.01em",
              background: "linear-gradient(135deg, #a5b4fc, #c4b5fd)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              +{f.xp} XP
            </span>
          </div>
        ))}
      </div>

      {/* Context toasts — top center */}
      <div
        aria-live="polite"
        style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            style={{
              background: "rgba(15,20,35,0.92)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: "8px 16px",
              backdropFilter: "blur(12px)",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              animation: t.removing
                ? "cfb-toast-out 350ms ease-in forwards"
                : "cfb-toast-in 300ms cubic-bezier(0.34,1.56,0.64,1) forwards",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontSize: 16 }}>{t.emoji}</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600 }}>
              {t.text}
            </span>
          </div>
        ))}
      </div>

      {/* Confetti burst */}
      {confetti && (
        <div
          aria-hidden="true"
          style={{ position: "fixed", inset: 0, zIndex: 490, pointerEvents: "none", overflow: "hidden" }}
        >
          {confetti.map((p) => (
            <div
              key={p.id}
              style={{
                position: "absolute",
                top: 0,
                left: `${p.x}%`,
                width: p.size,
                height: p.shape === "circle" ? p.size : p.size * 0.5,
                borderRadius: p.shape === "circle" ? "50%" : 2,
                background: p.color,
                "--tx": `${p.tx}px`,
                "--ty": `${p.ty}px`,
                "--rot": `${p.rot}deg`,
                animation: `cfb-confetti ${p.dur}ms ease-out ${p.delay}ms both`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Milestone modal */}
      {milestone && (
        <MilestoneModal
          streak={milestone.streak}
          onDismiss={() => setMilestone(null)}
        />
      )}
    </>
  );
}
