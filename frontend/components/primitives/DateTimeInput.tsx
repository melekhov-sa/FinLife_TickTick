"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { CalendarClock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "react-day-picker/dist/style.css";

type Size = "sm" | "md" | "lg";

export interface DateTimeInputProps {
  /** ISO без секунд: "YYYY-MM-DDTHH:MM" или пустая строка. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: Size;
  className?: string;
  /** ISO YYYY-MM-DD. */
  min?: string;
  /** ISO YYYY-MM-DD. */
  max?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13px] px-2.5",
  md: "h-9 text-[13px] px-3",
  lg: "h-11 text-[14px] px-3.5",
};

const TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00", "21:00"];
const CALENDAR_WIDTH = 304;

function parseValue(v: string): { date: Date | undefined; time: string } {
  if (!v) return { date: undefined, time: "" };
  const [datePart, timePart = ""] = v.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return { date: undefined, time: "" };
  return { date: new Date(y, m - 1, d), time: timePart };
}

function parseDateOnly(v?: string): Date | undefined {
  if (!v) return undefined;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combine(date: Date | undefined, time: string): string {
  if (!date) return "";
  return `${toISODate(date)}T${time || "09:00"}`;
}

function formatDisplay(v: string): string {
  const { date, time } = parseValue(v);
  if (!date) return "";
  const datePart = date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  return time ? `${datePart}, ${time}` : datePart;
}

function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function DateTimeInput({
  value,
  onChange,
  placeholder = "Выберите дату и время",
  disabled = false,
  size = "md",
  className,
  min,
  max,
}: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const [manualTime, setManualTime] = useState("");
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const { date: selectedDate, time: selectedTime } = parseValue(value);
  const minDate = parseDateOnly(min);
  const maxDate = parseDateOnly(max);
  const display = formatDisplay(value);

  useEffect(() => {
    setManualTime(selectedTime || "");
  }, [selectedTime]);

  function calcCoords() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const flip = spaceBelow < 380;
    let left = r.left;
    if (left + CALENDAR_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - CALENDAR_WIDTH - 8;
    }
    setCoords({ top: flip ? r.top - 6 : r.bottom + 6, left });
  }

  useLayoutEffect(() => {
    if (open) calcCoords();
  }, [open]);

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

  function pickDate(d: Date | undefined) {
    if (!d) return;
    onChange(combine(d, selectedTime));
  }

  function pickTime(t: string) {
    onChange(combine(selectedDate ?? new Date(), t));
  }

  function commitManualTime() {
    if (isValidTime(manualTime)) pickTime(manualTime);
  }

  const calendar = open ? (
    <div
      ref={calendarRef}
      className={cn(
        "fixed z-[9999] rounded-xl border shadow-xl p-2",
        "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.07]",
      )}
      style={{ top: coords.top, left: coords.left, width: CALENDAR_WIDTH }}
    >
      <DayPicker
        mode="single"
        locale={ru}
        weekStartsOn={1}
        selected={selectedDate}
        onSelect={pickDate}
        disabled={[
          ...(minDate ? [{ before: minDate }] : []),
          ...(maxDate ? [{ after: maxDate }] : []),
        ]}
        today={new Date()}
        classNames={{
          root: "rdp-finlife",
          months: "flex flex-col",
          month: "",
          caption: "flex items-center justify-between px-1 mb-2",
          caption_label: "text-[13px] font-semibold text-slate-900 dark:text-slate-100 capitalize",
          nav: "flex items-center gap-1",
          nav_button:
            "w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400",
          table: "w-full border-collapse",
          head_row: "",
          head_cell: "text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 w-8 h-7 text-center",
          row: "",
          cell: "p-0 text-center align-middle",
          day: cn(
            "w-8 h-8 inline-flex items-center justify-center rounded-md text-[12.5px]",
            "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10",
            "transition-colors",
          ),
          day_today: "font-semibold text-[var(--app-accent)]",
          day_selected: "!bg-[var(--app-accent)] !text-[#fff] hover:!bg-[var(--app-accent)]",
          day_outside: "text-slate-300 dark:text-slate-600",
          day_disabled: "opacity-40 pointer-events-none",
        }}
      />

      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/[0.05]">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1 pb-1.5">
          Время
        </div>
        <div className="flex flex-wrap gap-1.5 px-1 pb-2">
          {TIME_PRESETS.map((t) => {
            const active = t === selectedTime;
            return (
              <button
                key={t}
                type="button"
                onClick={() => pickTime(t)}
                className={cn(
                  "h-7 px-2.5 rounded-md text-[12px] tabular-nums transition-colors",
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
        <div className="flex gap-1.5 px-1">
          <input
            type="text"
            inputMode="numeric"
            value={manualTime}
            onChange={(e) => setManualTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitManualTime();
              }
            }}
            placeholder="ЧЧ:ММ"
            className={cn(
              "flex-1 h-8 px-2.5 rounded-md border text-[13px] tabular-nums outline-none",
              "bg-white border-slate-300 text-slate-900",
              "dark:bg-white/[0.03] dark:border-white/15 dark:text-slate-100",
              "focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent)] dark:focus:border-[var(--app-accent)]",
              manualTime && !isValidTime(manualTime) && "border-red-500 focus:border-red-500 focus:ring-red-500/30",
            )}
          />
          <button
            type="button"
            onClick={commitManualTime}
            disabled={!isValidTime(manualTime)}
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
          sizeClasses[size],
        )}
      >
        <CalendarClock size={size === "lg" ? 16 : 14} className="shrink-0 text-slate-500 dark:text-slate-400" />
        <span
          className={cn(
            "flex-1 truncate",
            display ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500",
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
