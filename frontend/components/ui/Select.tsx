"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  emoji?: string;
  /** If set, options with the same group string are rendered under a group header */
  group?: string;
}

export interface SelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Show search input inside the dropdown */
  searchable?: boolean;
  className?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupOptions(options: SelectOption[]): { header: string | null; items: SelectOption[] }[] {
  const result: { header: string | null; items: SelectOption[] }[] = [];
  let currentGroup: string | null = null;
  let currentItems: SelectOption[] = [];

  for (const opt of options) {
    const g = opt.group ?? null;
    if (g !== currentGroup) {
      if (currentItems.length > 0) result.push({ header: currentGroup, items: currentItems });
      currentGroup = g;
      currentItems = [opt];
    } else {
      currentItems.push(opt);
    }
  }
  if (currentItems.length > 0) result.push({ header: currentGroup, items: currentItems });
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Select({
  value,
  onChange,
  options,
  placeholder = "— выберите —",
  disabled = false,
  searchable,
  className = "",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);

  // Decide whether to show search based on explicit prop or option count
  const showSearch = searchable ?? options.length > 8;
  const strValue   = String(value);

  // ── Filter options ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const flatFiltered = filtered; // flat list for keyboard nav
  const grouped      = groupOptions(filtered);

  const selectedLabel = options.find((o) => o.value === strValue);

  // ── Position panel ───────────────────────────────────────────────────────
  const reposition = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const maxH = 280;

    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const availH = Math.min(maxH, openUp ? spaceAbove : spaceBelow);

    setPanelStyle({
      position: "fixed",
      left:     r.left,
      width:    r.width,
      maxHeight: availH,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    // focus search or first item
    if (showSearch) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition, showSearch]);

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onOut(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, [open]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  function handleTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setFocusedIdx(0); }
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
  }

  function handleListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); setSearch(""); triggerRef.current?.focus(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, flatFiltered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      const opt = flatFiltered[focusedIdx];
      if (opt) { onChange(opt.value); setOpen(false); setSearch(""); triggerRef.current?.focus(); }
    }
  }

  // Scroll focused item into view
  useEffect(() => {
    if (!listRef.current || focusedIdx < 0) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-idx]");
    items[focusedIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  function pick(val: string) {
    onChange(val);
    setOpen(false);
    setSearch("");
    setFocusedIdx(-1);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const triggerCls = [
    "relative w-full flex items-center gap-2 h-11 px-3.5 rounded-xl border transition-all outline-none text-left",
    "bg-white/[0.04] border-white/[0.08]",
    "hover:bg-white/[0.06] hover:border-white/[0.14]",
    "focus:border-[rgba(110,120,255,0.65)] focus:shadow-[0_0_0_3px_rgba(110,120,255,0.14)]",
    disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
    className,
  ].join(" ");

  const panel = (
    <div
      ref={panelRef}
      style={{ ...panelStyle, background: "#1b2230" }}
      className="overflow-y-auto rounded-xl border border-white/[0.06] shadow-[0_12px_32px_rgba(0,0,0,0.35)] py-1.5"
      onKeyDown={handleListKey}
      tabIndex={-1}
    >
      {showSearch && (
        <div className="px-2 pb-1.5 pt-0.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0); }}
              placeholder="Поиск..."
              className="w-full pl-7 pr-3 h-8 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
              style={{ color: "rgba(255,255,255,0.85)" }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx(0); listRef.current?.focus(); }
                if (e.key === "Escape") { setOpen(false); setSearch(""); triggerRef.current?.focus(); }
              }}
            />
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="px-4 py-3 text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>Ничего не найдено</p>
      )}

      <div ref={listRef} tabIndex={-1} onKeyDown={handleListKey}>
        {grouped.map((g) => (
          <div key={g.header ?? "__nogroup"}>
            {g.header && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                {g.header}
              </p>
            )}
            {g.items.map((opt) => {
              const idx = flatFiltered.indexOf(opt);
              const isSelected = opt.value === strValue;
              const isFocused  = idx === focusedIdx;
              return (
                <button
                  key={opt.value}
                  data-idx={idx}
                  type="button"
                  onClick={() => pick(opt.value)}
                  onMouseEnter={() => setFocusedIdx(idx)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left min-h-[36px] transition-colors mx-1 outline-none"
                  style={{
                    width: "calc(100% - 8px)",
                    background: isSelected
                      ? "rgba(110,120,255,0.18)"
                      : isFocused
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                    color: isSelected ? "#ffffff" : "rgba(255,255,255,0.92)",
                  }}
                >
                  {opt.emoji && (
                    <span className="shrink-0 text-[15px] leading-none w-5 text-center">{opt.emoji}</span>
                  )}
                  <span className="flex-1 truncate text-[14px] font-[500]">{opt.label}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-indigo-400" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen((v) => !v); setFocusedIdx(-1); } }}
        onKeyDown={handleTriggerKey}
        className={triggerCls}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel?.emoji && (
          <span className="shrink-0 text-[15px] leading-none">{selectedLabel.emoji}</span>
        )}
        <span
          className="flex-1 truncate text-[14px] font-[500] text-left"
          style={{ color: selectedLabel ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.4)" }}
        >
          {selectedLabel ? selectedLabel.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-200"
          style={{ color: "rgba(255,255,255,0.35)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(panel, document.body)
      }
    </div>
  );
}
