"use client";

// Выбор периода для матрицы бюджета. Вынесено из page.tsx: блок полностью
// самодостаточен (наружу торчат только value/onChange/label), а страница была
// на 3111 строк, из-за чего любая правка в ней становилась рискованной.

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";

// ── Period picker ─────────────────────────────────────────────────────────────

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

export interface PeriodSelection { year: number; month: number; rangeCount: number; }

export function PeriodPicker({ value, onChange, label }: {
  value: PeriodSelection;
  onChange: (v: PeriodSelection) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [cYear, setCYear] = useState(value.year);
  const [cMonth, setCMonth] = useState(value.month);
  const [cCount, setCCount] = useState(value.rangeCount);

  React.useEffect(() => { setCYear(value.year); setCMonth(value.month); setCCount(value.rangeCount); }, [value.year, value.month, value.rangeCount]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - 318);
      setDropPos({ top: r.bottom + 6, left: Math.max(8, left) });
    }
    setOpen(v => !v);
  }

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!dropRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    }
    function handleScroll() { setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  const curQStart = Math.floor((cm - 1) / 3) * 3 + 1;
  const prevQStart = curQStart > 3 ? curQStart - 3 : 10;
  const prevQYear = curQStart > 3 ? cy : cy - 1;
  const prevM = cm === 1 ? 12 : cm - 1;
  const prevMY = cm === 1 ? cy - 1 : cy;

  const presets: Array<{ label: string } & PeriodSelection> = [
    { label: "Текущий месяц",    year: cy,       month: cm,          rangeCount: 1  },
    { label: "Текущий квартал",  year: cy,       month: curQStart,   rangeCount: 3  },
    { label: "Текущий год",      year: cy,       month: 1,           rangeCount: 12 },
    { label: "Прошлый месяц",    year: prevMY,   month: prevM,       rangeCount: 1  },
    { label: "Прошлый квартал",  year: prevQYear,month: prevQStart,  rangeCount: 3  },
    { label: "Прошлый год",      year: cy - 1,   month: 1,           rangeCount: 12 },
  ];

  const apply = (v: PeriodSelection) => { onChange(v); setOpen(false); };

  const dropdown = open ? (
    <div
      ref={dropRef}
      className="rounded-xl shadow-2xl p-4"
      style={{
        position: "fixed",
        top: dropPos.top,
        left: dropPos.left,
        zIndex: 9999,
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
        minWidth: 310,
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>Быстрый выбор</p>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => apply(p)}
            className="text-[11px] font-medium px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-[var(--app-accent-weak)]"
            style={{ color: "var(--t-secondary)", border: "1px solid var(--app-border)" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>Произвольный период</p>
        <div className="flex items-center gap-2">
          <select value={cYear} onChange={e => setCYear(+e.target.value)}
            className="h-8 px-2 rounded-lg text-[12px] flex-1"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}>
            {[cy-3,cy-2,cy-1,cy,cy+1,cy+2].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={cMonth} onChange={e => setCMonth(+e.target.value)}
            className="h-8 px-2 rounded-lg text-[12px] flex-1"
            style={{ background: "var(--app-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}>
            {MONTHS_RU.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-[11px] shrink-0" style={{ color: "var(--t-faint)" }}>Периодов:</span>
          <div className="flex gap-px">
            {[1,2,3,4,6,12].map(n => (
              <button key={n} onClick={() => setCCount(n)}
                className={clsx("w-7 h-6 text-[11px] font-medium rounded transition-colors",
                  cCount === n ? "bg-[var(--app-accent)] text-[#fff]" : "hover:bg-[var(--app-accent-light)]")}
                style={cCount !== n ? { color: "var(--t-muted)" } : undefined}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => apply({ year: cYear, month: cMonth, rangeCount: cCount })}
          className="mt-3 w-full py-2 text-[12px] font-semibold rounded-lg bg-[var(--app-accent)] text-[#fff] hover:brightness-110 transition-colors"
        >
          Применить
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors hover:bg-[var(--app-accent-weak)]"
        style={{ color: "var(--t-primary)", border: "1px solid var(--app-border)", background: "var(--app-card-bg)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {label}
        <ChevronDown size={13} style={{ color: "var(--t-muted)", flexShrink: 0 }} />
      </button>
      {typeof window !== "undefined" && dropdown ? createPortal(dropdown, document.body) : null}
    </>
  );
}
