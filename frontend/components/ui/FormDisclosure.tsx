"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Складной блок для редких полей формы.
 *
 * В модалках набиралось по 14–19 одинаковых рядов, хотя в обычном сценарии
 * заполняются три-четыре. Остальное место занимало, заставляло скроллить и
 * размывало главное. Такие поля живут здесь и открываются по требованию.
 *
 * `badge` показывает, что внутри уже что-то заполнено, — иначе закрытый блок
 * прячет изменения, и это читается как потеря данных.
 */
export function FormDisclosure({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string | null;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--app-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
        style={{ color: "var(--t-secondary)" }}
      >
        <ChevronRight
          size={14}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : undefined, color: "var(--t-faint)" }}
        />
        <span className="flex-1 min-w-0 truncate">{title}</span>
        {badge && !open && (
          <span
            className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md truncate max-w-[55%]"
            style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="px-3 pb-3 pt-3 flex flex-col gap-3 border-t"
          style={{ borderColor: "var(--app-border)" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
