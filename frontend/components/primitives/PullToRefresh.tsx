"use client";

import { useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

/**
 * Pull-to-refresh: тянешь список вниз от верха — данные обновляются.
 * Работает и в PWA, и в нативной оболочке (тач-события). Скроллируемый
 * контейнер находится автоматически среди предков.
 */

const THRESHOLD = 72; // px протяжки до срабатывания

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const scroller = findScrollParent(rootRef.current);
    const atTop = !scroller || scroller.scrollTop <= 0;
    startYRef.current = atTop ? e.touches[0].clientY : null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startYRef.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startYRef.current;
    // тянем только вниз и с сопротивлением
    setPull(dy > 0 ? Math.min(dy * 0.45, THRESHOLD * 1.6) : 0);
  }

  async function onTouchEnd() {
    if (startYRef.current === null || refreshing) return;
    startYRef.current = null;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.75);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const armed = pull >= THRESHOLD;

  return (
    <div
      ref={rootRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: pull > 0 ? `translateY(${pull}px)` : undefined,
        transition: startYRef.current === null ? "transform 220ms cubic-bezier(0.22,1,0.36,1)" : "none",
      }}
    >
      {/* Индикатор над контентом */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 right-0 flex justify-center"
        style={{ top: -44, opacity: pull > 8 ? Math.min(pull / THRESHOLD, 1) : 0 }}
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shadow-md"
          style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
        >
          <RotateCcw
            size={16}
            className={refreshing ? "animate-spin" : undefined}
            style={{
              color: armed || refreshing ? "var(--app-accent)" : "var(--t-faint)",
              transform: refreshing ? undefined : `rotate(${pull * 2.4}deg)`,
            }}
          />
        </span>
      </div>
      {children}
    </div>
  );
}
