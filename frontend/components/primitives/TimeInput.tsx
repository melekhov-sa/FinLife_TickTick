"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticTick } from "@/lib/native";

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

/**
 * Маска ручного ввода: юзер печатает только цифры, двоеточие ставится само.
 * "1650" → "16:50", "930" → "09:30" (93 — не час, значит 9:30), "165" → "16:5".
 */
function maskTimeInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 1) return d;
  if (d.length === 2) {
    // "93" не может быть часом — трактуем как 9:3
    return parseInt(d, 10) > 23 ? `0${d[0]}:${d[1]}` : d;
  }
  if (d.length === 3) {
    const hh = parseInt(d.slice(0, 2), 10);
    return hh <= 23 ? `${d.slice(0, 2)}:${d[2]}` : `0${d[0]}:${d.slice(1)}`;
  }
  return `${d.slice(0, 2)}:${d.slice(2)}`;
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
  const [isMobile, setIsMobile] = useState(false);
  const [manual, setManual] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const presets = step ? generatePresets(step) : DEFAULT_PRESETS;

  useEffect(() => {
    setManual(value || "");
  }, [value]);

  useEffect(() => {
    if (!open || isMobile) return;
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
  }, [open, isMobile]);

  useEffect(() => {
    if (autoFocus) triggerRef.current?.focus();
  }, [autoFocus]);

  function commit(t: string) {
    void hapticTick();
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

  // Нижний шит на мобиле: пресеты + цифровое поле с маской (вместо колеса iOS)
  const mobileSheet = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 animate-overlay-fade"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col animate-sheet-up overflow-hidden"
        style={{ background: "var(--app-card-bg, #fff)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: "var(--t-faint)", opacity: 0.5 }} />
        </div>
        <p className="px-5 pb-3 text-[13px] font-semibold shrink-0" style={{ color: "var(--t-muted)" }}>
          {placeholder}
        </p>

        {/* Цифровое поле: печатай 1650 — станет 16:50 и применится само */}
        <div className="px-4 pb-3 flex gap-2 shrink-0">
          <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            value={manual}
            onChange={(e) => {
              const m = maskTimeInput(e.target.value);
              setManual(m);
              if (m.length === 5 && isValidTime(m)) commit(m);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                tryCommitManual();
              }
            }}
            placeholder="16:50"
            className="flex-1 h-12 px-3 rounded-xl border text-center text-[22px] font-semibold tabular-nums outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)]"
            style={{
              background: "var(--app-bg)",
              borderColor: manual && !isValidTime(manual) && manual.length >= 5 ? "#ef4444" : "var(--app-border)",
              color: "var(--t-primary)",
            }}
          />
          {value && (
            <button
              type="button"
              onClick={() => { setManual(""); commit(""); }}
              className="h-12 px-4 rounded-xl text-[13px] font-medium shrink-0"
              style={{ border: "1px solid var(--app-border)", color: "var(--t-muted)", background: "transparent" }}
            >
              Убрать
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-2 shrink-0">
          {presets.map((t) => {
            const active = t === value;
            return (
              <button
                key={t}
                type="button"
                onClick={() => commit(t)}
                className="h-11 rounded-xl text-[15px] font-medium tabular-nums transition-colors active:scale-[0.97]"
                style={
                  active
                    ? { background: "var(--app-accent)", color: "#fff" }
                    : { background: "var(--app-accent-weak, rgba(0,0,0,0.05))", color: "var(--t-primary)" }
                }
              >
                {t}
              </button>
            );
          })}
        </div>

        <div style={{ height: "max(12px, env(safe-area-inset-bottom))" }} className="shrink-0" />
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center w-full gap-2 rounded-lg border bg-white text-left transition-colors",
          "border-slate-300 dark:border-white/15 dark:bg-white/[0.03]",
          "focus:outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)] dark:focus:border-[var(--app-accent)]",
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
          <span style={{ position: "relative", zIndex: 2 }}
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

      {open && !isMobile && (
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
                      ? "bg-[var(--app-accent)] text-[#fff]"
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
                onChange={(e) => {
                  const m = maskTimeInput(e.target.value);
                  setManual(m);
                  // Полное валидное время — применяем сразу, без «ОК»
                  if (m.length === 5 && isValidTime(m)) commit(m);
                }}
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
                  "focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)] dark:focus:border-[var(--app-accent)]",
                  manual && !isValidTime(manual) && "border-red-500 focus:border-red-500 focus:ring-red-500/30",
                )}
              />
              <button
                type="button"
                onClick={tryCommitManual}
                disabled={!isValidTime(manual) && manual !== ""}
                className={cn(
                  "h-8 px-3 rounded-md text-[13px] font-medium transition-colors",
                  "bg-[var(--app-accent)] text-[#fff] hover:brightness-110",
                  "disabled:opacity-50 disabled:pointer-events-none",
                )}
              >
                ОК
              </button>
            </div>
          </div>
        </div>
      )}

      {open && isMobile && typeof document !== "undefined" && createPortal(mobileSheet, document.body)}
    </div>
  );
}
