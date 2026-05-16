"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SplitButton
 *
 * Два паттерна:
 *   A) с `primary` — главное действие (клик слева) + чевронная часть справа открывает меню вариантов.
 *      Используется когда есть "очевидный" дефолт (например, /plan → «Задача» по умолчанию).
 *   B) без `primary` — вся кнопка одна, открывает меню равноправных вариантов.
 *      Используется когда варианты равноправны (например, /money → Расход / Доход / Перевод).
 *
 * NB: если items.length === 1 и primary не задан — лучше использовать обычную <Button>
 *     (SplitButton ради одного пункта избыточен).
 */

export type SplitButtonVariant = "primary" | "secondary";
export type SplitButtonSize = "sm" | "md";

export interface SplitButtonItem {
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  shortcut?: string;
  disabled?: boolean;
}

export interface SplitButtonProps {
  /** Главное действие (включает паттерн A). */
  primary?: { label: ReactNode; icon?: ReactNode; onClick?: () => void };
  /** Варианты в выпадающем меню. */
  items: SplitButtonItem[];
  variant?: SplitButtonVariant;
  size?: SplitButtonSize;
  className?: string;
  disabled?: boolean;
  /** Aria-label для чевронной части (паттерн A). */
  menuAriaLabel?: string;
}

const SIZE = {
  sm: { h: 32, px: 12, fs: 13, gap: 6, chev: 30 },
  md: { h: 36, px: 14, fs: 14, gap: 6, chev: 32 },
} as const;

export const SplitButton = forwardRef<HTMLDivElement, SplitButtonProps>(
  function SplitButton(
    {
      primary,
      items,
      variant = "primary",
      size = "md",
      className,
      disabled = false,
      menuAriaLabel = "Другие варианты",
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);

    const sz = SIZE[size];

    const skin =
      variant === "primary"
        ? {
            bg: "var(--app-accent)",
            fg: "#FFFFFF",
            border: "transparent",
            inner: "rgba(255,255,255,.18)",
          }
        : {
            bg: "var(--app-card-bg)",
            fg: "var(--t-primary)",
            border: "var(--app-border)",
            inner: "var(--app-border)",
          };

    // Pattern A — primary + chevron
    if (primary) {
      return (
        <div
          ref={(node) => {
            wrapRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className={cn("inline-flex relative", className)}
          style={{ fontSize: sz.fs }}
        >
          <button
            type="button"
            onClick={primary.onClick}
            disabled={disabled}
            className="inline-flex items-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              height: sz.h,
              padding: `0 ${sz.px}px`,
              gap: sz.gap,
              background: skin.bg,
              color: skin.fg,
              border: `1px solid ${skin.border}`,
              borderRight: `1px solid ${skin.inner}`,
              borderTopLeftRadius: 10,
              borderBottomLeftRadius: 10,
            }}
          >
            {primary.icon}
            {primary.label}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={menuAriaLabel}
            className="inline-flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              width: sz.chev,
              height: sz.h,
              background: skin.bg,
              color: skin.fg,
              border: `1px solid ${skin.border}`,
              borderLeft: "none",
              borderTopRightRadius: 10,
              borderBottomRightRadius: 10,
            }}
          >
            <ChevronDown size={14} strokeWidth={1.9} />
          </button>
          {open && <SplitMenu items={items} onClose={() => setOpen(false)} />}
        </div>
      );
    }

    // Pattern B — whole button opens menu
    return (
      <div
        ref={(node) => {
          wrapRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn("inline-flex relative", className)}
        style={{ fontSize: sz.fs }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            height: sz.h,
            padding: `0 ${sz.px}px`,
            gap: sz.gap,
            borderRadius: 10,
            background: skin.bg,
            color: skin.fg,
            border: `1px solid ${skin.border}`,
          }}
        >
          Создать
          <ChevronDown size={14} strokeWidth={1.9} />
        </button>
        {open && <SplitMenu items={items} onClose={() => setOpen(false)} />}
      </div>
    );
  },
);

function SplitMenu({
  items,
  onClose,
}: {
  items: SplitButtonItem[];
  onClose: () => void;
}) {
  return (
    <div
      role="menu"
      className="absolute right-0 mt-2 min-w-[200px] py-1.5 z-50"
      style={{
        top: "100%",
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
        borderRadius: 12,
        boxShadow:
          "0 16px 40px -16px rgba(0,0,0,.25), 0 4px 12px -4px rgba(0,0,0,.08)",
      }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            it.onClick?.();
            onClose();
          }}
          className="w-full inline-flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            padding: "8px 12px",
            gap: 10,
            fontSize: 13.5,
            color: "var(--t-primary)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            if (!it.disabled)
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--c-neutral-bg)";
          }}
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "transparent")
          }
        >
          {it.icon && (
            <span style={{ color: "var(--t-muted)", display: "inline-flex" }}>
              {it.icon}
            </span>
          )}
          <span style={{ flex: 1, textAlign: "left" }}>{it.label}</span>
          {it.shortcut && (
            <kbd
              style={{
                fontSize: 11,
                color: "var(--t-faint)",
                background: "var(--c-neutral-bg)",
                padding: "2px 5px",
                borderRadius: 4,
                fontFamily: "inherit",
              }}
            >
              {it.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  );
}

export default SplitButton;
