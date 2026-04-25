"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

interface DateInputProps {
  /** Значение в формате YYYY-MM-DD или пустая строка. */
  value: string;
  /** Колбек получает YYYY-MM-DD или пустую строку при сбросе. */
  onChange: (value: string) => void;
  /** Плейсхолдер когда дата не выбрана. */
  placeholder?: string;
  /** Заблокировать. */
  disabled?: boolean;
  /** Размер инпута sm | md | lg. */
  size?: "sm" | "md" | "lg";
  /** Доп. класс. */
  className?: string;
  /** Минимальная дата. */
  min?: string;
  /** Максимальная дата. */
  max?: string;
  /** Авто-фокус при mount. */
  autoFocus?: boolean;
}

const sizeClasses: Record<NonNullable<DateInputProps["size"]>, string> = {
  sm: "h-8 text-[13px] px-2.5",
  md: "h-9 text-[13px] px-3",
  lg: "h-11 text-[14px] px-3.5",
};

function parseISO(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(value: string): string {
  const d = parseISO(value);
  if (!d) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function DateInput({
  value,
  onChange,
  placeholder = "Выберите дату",
  disabled = false,
  size = "md",
  className,
  min,
  max,
  autoFocus = false,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = parseISO(value);
  const minDate = parseISO(min ?? "");
  const maxDate = parseISO(max ?? "");
  const display = formatDisplay(value);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
          sizeClasses[size]
        )}
      >
        <CalendarIcon size={size === "lg" ? 16 : 14} className="shrink-0 text-slate-500 dark:text-slate-400" />
        <span
          className={cn(
            "flex-1 truncate",
            display ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
          )}
        >
          {display || placeholder}
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
            "absolute z-50 mt-1 rounded-xl border shadow-lg p-2",
            "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.07]"
          )}
        >
          <DayPicker
            mode="single"
            locale={ru}
            weekStartsOn={1}
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(toISO(d));
                setOpen(false);
              }
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            today={new Date()}
            footer={
              <div className="mt-2 flex items-center justify-between text-[12px] px-1">
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Очистить
                </button>
                <button
                  type="button"
                  onClick={() => { onChange(toISO(new Date())); setOpen(false); }}
                  className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  Сегодня
                </button>
              </div>
            }
            classNames={{
              root: "rdp-finlife",
              months: "flex flex-col",
              month: "",
              caption: "flex items-center justify-between px-1 mb-2",
              caption_label: "text-[13px] font-semibold text-slate-900 dark:text-slate-100 capitalize",
              nav: "flex items-center gap-1",
              nav_button: "w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400",
              table: "w-full border-collapse",
              head_row: "",
              head_cell: "text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 w-8 h-7 text-center",
              row: "",
              cell: "p-0 text-center align-middle",
              day: cn(
                "w-8 h-8 inline-flex items-center justify-center rounded-md text-[12.5px]",
                "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10",
                "transition-colors"
              ),
              day_today: "font-semibold text-indigo-600 dark:text-indigo-400",
              day_selected: "!bg-indigo-600 !text-[#fff] hover:!bg-indigo-500",
              day_outside: "text-slate-300 dark:text-slate-600",
              day_disabled: "opacity-40 pointer-events-none",
            }}
          />
        </div>
      )}
    </div>
  );
}
