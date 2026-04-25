"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

export interface TimeInputProps {
  /** Значение в формате HH:MM или пустая строка. */
  value: string;
  /** Колбек получает HH:MM или пустую строку. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: Size;
  className?: string;
  autoFocus?: boolean;
  /** Шаг минут для preset-генерации (по умолчанию используется фикс. список). */
  step?: number;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13px] px-2.5",
  md: "h-9 text-[13px] px-3",
  lg: "h-11 text-[14px] px-3.5",
};

const DEFAULT_PRESETS = ["09:00", "10:00", "12:00", "15:00", "18:00", "21:00"];

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function generatePresets(step: number): string[] {
  const out: string[] = [];
  // generate from 06:00 to 23:00 by step
  for (let m = 6 * 60; m < 24 * 60; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  }
  return out;
}

export function TimeInput({
  value,
  onChange,
  placeholder = "Выберите время",
  disabled = false,
  size = "md",
  className,
  autoFocus = false,
  step,
}: TimeInputProps) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const presets = step ? generatePresets(step) : DEFAULT_PRESETS;

  useEffect(() => {
    setManual(value || "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

  function commit(t: string) {
    onChange(t);
    setOpen(false);
  }

  function tryCommitManual() {
    if (isValidTime(manual)) {
      commit(manual);
    } else if (manual === "") {
      commit("");
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center w-full gap-2 rounded-lg border bg-white text-left transition-colors",
          "border-slate-300 dark:border-white/15 dark:bg-white/[0.03]",
          "focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:focus:border-indigo-400",
          "disabled:opacity-50 disabled:pointer-events-none",
          sizeClasses[size],
        )}
      >
        <Clock size={size === "lg" ? 16 : 14} className="shrink-0 text-slate-500 dark:text-slate-400" />
        <span
          className={cn(
            "flex-1 truncate tabular-nums",
            value
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500",
          )}
        >
          {value || placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Очистить"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 left-0 min-w-[220px] rounded-xl border shadow-lg p-3",
            "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.07]",
          )}
        >
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {presets.map((t) => {
              const active = t === value;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => commit(t)}
                  className={cn(
                    "h-8 rounded-md text-[13px] tabular-nums transition-colors",
                    active
                      ? "bg-indigo-600 text-[#fff] dark:bg-indigo-500"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-100 dark:border-white/[0.05] pt-3">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 block mb-1.5">
              Вручную
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tryCommitManual();
                  }
                }}
                placeholder="ЧЧ:ММ"
                className={cn(
                  "flex-1 h-8 px-2.5 rounded-md border text-[13px] tabular-nums outline-none",
                  "bg-white border-slate-300 text-slate-900",
                  "dark:bg-white/[0.03] dark:border-white/15 dark:text-slate-100",
                  "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:focus:border-indigo-400",
                  manual && !isValidTime(manual) && "border-red-500 focus:border-red-500 focus:ring-red-500/30",
                )}
              />
              <button
                type="button"
                onClick={tryCommitManual}
                disabled={!isValidTime(manual) && manual !== ""}
                className={cn(
                  "h-8 px-3 rounded-md text-[13px] font-medium transition-colors",
                  "bg-indigo-600 text-[#fff] hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400",
                  "disabled:opacity-50 disabled:pointer-events-none",
                )}
              >
                ОК
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
