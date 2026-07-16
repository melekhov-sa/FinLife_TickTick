"use client";

/**
 * iOS-свайп по строке: вправо — левое действие (обычно «выполнить»),
 * влево — правое («перенести»/«редактировать»). Только тач; захватывает
 * жест лишь при явно горизонтальном движении, чтобы не мешать скроллу,
 * drag-n-drop (long-press) и свайпу вкладок.
 */

import { useRef, useState, type ReactNode } from "react";
import { hapticTick } from "@/lib/native";

export interface SwipeRowAction {
  icon: ReactNode;
  color: string;        // фон подложки
  onTrigger: () => void;
}

const THRESHOLD = 84;   // px до срабатывания
const MAX_PULL = 132;

export function SwipeRow({
  left,
  right,
  children,
  className,
}: {
  /** Появляется при свайпе ВПРАВО (палец тянет вправо). */
  left?: SwipeRowAction;
  /** Появляется при свайпе ВЛЕВО. */
  right?: SwipeRowAction;
  children: ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const captured = useRef(false);
  const armed = useRef(false);

  if (!left && !right) {
    return <div className={className}>{children}</div>;
  }

  function resistance(raw: number): number {
    const abs = Math.min(Math.abs(raw), MAX_PULL);
    const eased = abs <= THRESHOLD ? abs : THRESHOLD + (abs - THRESHOLD) * 0.4;
    return Math.sign(raw) * eased;
  }

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    start.current = { x: t.clientX, y: t.clientY };
    captured.current = false;
    armed.current = false;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = start.current;
    const t = e.touches[0];
    if (!s || !t) return;
    const rawDx = t.clientX - s.x;
    const rawDy = t.clientY - s.y;

    if (!captured.current) {
      if (Math.abs(rawDx) < 14) return;
      if (Math.abs(rawDx) < Math.abs(rawDy) * 1.4) {
        // вертикальное движение — отдаём скроллу
        start.current = null;
        setDragging(false);
        return;
      }
      // жест наш, но только в сторону, где есть действие
      if ((rawDx > 0 && !left) || (rawDx < 0 && !right)) {
        start.current = null;
        setDragging(false);
        return;
      }
      captured.current = true;
    }

    e.stopPropagation();
    const next = resistance(rawDx);
    // не даём утянуть в сторону без действия
    if ((next > 0 && !left) || (next < 0 && !right)) {
      setDx(0);
      return;
    }
    const nowArmed = Math.abs(next) >= THRESHOLD;
    if (nowArmed !== armed.current) {
      armed.current = nowArmed;
      void hapticTick();
    }
    setDx(next);
  }

  function onTouchEnd() {
    const finalDx = dx;
    start.current = null;
    setDragging(false);
    if (captured.current && Math.abs(finalDx) >= THRESHOLD) {
      const action = finalDx > 0 ? left : right;
      action?.onTrigger();
    }
    captured.current = false;
    armed.current = false;
    setDx(0);
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {dx > 0 && left && (
        <div
          className="absolute inset-0 flex items-center pl-5 text-white"
          style={{ background: left.color, opacity: Math.min(1, Math.abs(dx) / THRESHOLD) }}
        >
          {left.icon}
        </div>
      )}
      {dx < 0 && right && (
        <div
          className="absolute inset-0 flex items-center justify-end pr-5 text-white"
          style={{ background: right.color, opacity: Math.min(1, Math.abs(dx) / THRESHOLD) }}
        >
          {right.icon}
        </div>
      )}
      <div
        style={{
          transform: dx !== 0 ? `translateX(${dx}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s cubic-bezier(0.22,1,0.36,1)",
          background: dx !== 0 ? "var(--app-canvas, var(--app-bg))" : undefined,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
