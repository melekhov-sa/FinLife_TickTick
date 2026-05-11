"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs — два варианта: underline (главные разделы страницы) и pills (вторичные).
 *
 * Скроллится горизонтально на мобиле — на overflow контейнер вешает `.ph-scroll-x`.
 */

export type TabsVariant = "underline" | "pills";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Числовой бейдж (количество). */
  count?: number | string;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  variant?: TabsVariant;
  className?: string;
}

export function Tabs({ items, active, onChange, variant = "underline", className }: TabsProps) {
  if (variant === "pills") {
    return (
      <div className={cn("inline-flex flex-wrap gap-1.5", className)}>
        {items.map((it) => {
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onChange(it.id)}
              aria-pressed={isActive}
              className="inline-flex items-center gap-1.5 transition-colors"
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                background: isActive ? "var(--app-accent-weak)" : "transparent",
                color: isActive ? "var(--app-accent-ink)" : "var(--t-muted)",
                border: isActive ? "1px solid transparent" : "1px solid var(--app-border)",
              }}
            >
              {it.label}
              {it.count != null && (
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                    fontWeight: 600,
                    color: isActive ? "var(--app-accent-ink)" : "var(--t-faint)",
                    opacity: isActive ? 1 : 0.7,
                  }}
                >
                  {it.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-end ph-scroll-x", className)}
      style={{
        borderBottom: "1px solid var(--app-border)",
        marginBottom: -1,
      }}
    >
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-pressed={isActive}
            className="inline-flex items-center gap-2 transition-colors shrink-0"
            style={{
              height: 40,
              padding: "0 14px",
              fontSize: 13.5,
              fontWeight: 500,
              color: isActive ? "var(--t-primary)" : "var(--t-muted)",
              borderBottom: isActive
                ? "2px solid var(--app-accent)"
                : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {it.label}
            {it.count != null && (
              <span
                className="inline-flex items-center justify-center"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  minWidth: 20,
                  height: 18,
                  padding: "0 6px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  background: isActive ? "var(--app-accent-weak)" : "var(--c-neutral-bg)",
                  color: isActive ? "var(--app-accent-ink)" : "var(--t-muted)",
                }}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
