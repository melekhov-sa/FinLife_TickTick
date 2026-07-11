"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
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

const CALENDAR_WIDTH = 288;

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
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const selected = parseISO(value);
  const minDate = parseISO(min ?? "");
  const maxDate = parseISO(max ?? "");
  const display = formatDisplay(value);

  // Вычисляем позицию под кнопкой (fixed, чтобы вылезти из любого overflow)
  function calcCoords() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= 320 ? r.bottom + 6 : r.top - 6; // flip вверх если мало места
    const flip = spaceBelow < 320;

    let left = r.left;
    if (left + CALENDAR_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - CALENDAR_WIDTH - 8;
    }
    setCoords({ top: flip ? r.top - 6 : r.bottom + 6, left });
  }

  useLayoutEffect(() => {
    if (open) calcCoords();
  }, [open]);

  // Пересчитываем при скролле/ресайзе пока открыт
  useEffect(() => {
    if (!open) return;
    const update = () => calcCoords();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Закрытие по клику снаружи / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
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

  const calendar = open ? (
    <div
      ref={calendarRef}
      className={cn(
        "fixed z-[9999] rounded-xl border shadow-xl p-3",
        "bg-white border-slate-200",
        "dark:bg-[#1a1d23] dark:border-white/[0.07]",
      )}
      style={{ top: coords.top, left: coords.left, width: CALENDAR_WIDTH }}
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
        showOutsideDays
        components={{
          Chevron: ({ orientation }) =>
            orientation === "left" ? <ChevronLeft size={14} /> : <ChevronRight size={14} />,
        }}
        footer={
          <div
            className={cn(
              "mt-2 pt-2 flex items-center justify-between text-[12px]",
              "border-t border-slate-200 dark:border-white/[0.07]",
            )}
          >
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Очистить
            </button>
            <button
              type="button"
              onClick={() => { onChange(toISO(new Date())); setOpen(false); }}
              className="text-[var(--app-accent)] hover:text-[var(--app-accent)] font-semibold transition-colors"
            >
              Сегодня
            </button>
          </div>
        }
        classNames={{
          root: "rdp-finlife",
          months: "flex flex-col gap-2",
          month: "space-y-2",
          month_caption: "flex items-center justify-center relative h-8",
          caption_label: "text-[13px] font-semibold text-slate-900 dark:text-slate-100 capitalize",
          nav: "absolute inset-0 flex items-center justify-between pointer-events-none",
          button_previous: cn(
            "pointer-events-auto w-7 h-7 inline-flex items-center justify-center rounded-md border transition-colors",
            "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            "dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100",
          ),
          button_next: cn(
            "pointer-events-auto w-7 h-7 inline-flex items-center justify-center rounded-md border transition-colors",
            "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            "dark:border-white/[0.08] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-slate-100",
          ),
          month_grid: "w-full border-collapse",
          weekdays: "flex",
          weekday: cn(
            "w-9 h-7 inline-flex items-center justify-center text-[10px] font-semibold uppercase",
            "text-slate-400 dark:text-slate-500",
          ),
          week: "flex w-full mt-1",
          day: "w-9 h-9 text-center text-[13px] p-0",
          day_button: cn(
            "w-9 h-9 inline-flex items-center justify-center rounded-md font-medium transition-colors",
            "text-slate-700 dark:text-slate-200",
            "hover:bg-slate-100 dark:hover:bg-white/[0.08]",
          ),
          today: "[&>button]:font-bold [&>button]:text-[var(--app-accent)] dark:[&>button]:text-[var(--app-accent)]",
          selected:
            "[&>button]:!bg-[var(--app-accent)] [&>button]:!text-[#fff] [&>button]:hover:!bg-[var(--app-accent)]",
          outside: "[&>button]:text-slate-300 dark:[&>button]:text-slate-600",
          disabled: "opacity-40 pointer-events-none",
          hidden: "invisible",
        }}
      />
    </div>
  ) : null;

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center w-full gap-2 rounded-lg border bg-white text-left transition-colors",
          "border-slate-300 dark:border-white/15 dark:bg-white/[0.03]",
          "focus:outline-none focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)] dark:focus:border-[var(--app-accent)]",
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

      {typeof document !== "undefined" && createPortal(calendar, document.body)}
    </div>
  );
}
