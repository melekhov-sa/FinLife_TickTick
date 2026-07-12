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
import { useTheme } from "next-themes";
import { hapticTick } from "@/lib/native";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  emoji?: string;
  group?: string;
}

export interface SelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  footer?: React.ReactNode;
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
  footer,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);

  const showSearch = searchable ?? options.length > 8;
  const strValue   = String(value);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const flatFiltered = filtered;
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
      left: r.left,
      width: r.width,
      maxHeight: availH,
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
      zIndex: 9999,
    });
  }, []);

  useEffect(() => {
    if (!open || isMobile) return;
    reposition();
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 0);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition, showSearch]);

  useEffect(() => {
    if (!open) return;
    function onOut(e: MouseEvent) {
      if (triggerRef.current?.contains(e.target as Node) || panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, [open]);

  function handleTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setFocusedIdx(0); }
    }
    if (e.key === "Escape") { setOpen(false); setSearch(""); }
  }

  function handleListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); setSearch(""); triggerRef.current?.focus(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, flatFiltered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      const opt = flatFiltered[focusedIdx];
      if (opt) { onChange(opt.value); setOpen(false); setSearch(""); triggerRef.current?.focus(); }
    }
  }

  useEffect(() => {
    if (!listRef.current || focusedIdx < 0) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-idx]");
    items[focusedIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  function pick(val: string) {
    void hapticTick();
    onChange(val);
    setOpen(false);
    setSearch("");
    setFocusedIdx(-1);
  }

  // ── Theme-aware colors ──────────────────────────────────────────────────
  const c = isDark ? {
    triggerBg: "rgba(255,255,255,0.04)",
    triggerBorder: "rgba(255,255,255,0.08)",
    triggerHoverBg: "rgba(255,255,255,0.06)",
    triggerHoverBorder: "rgba(255,255,255,0.14)",
    text: "rgba(255,255,255,0.92)",
    textMuted: "rgba(255,255,255,0.4)",
    textFaint: "rgba(255,255,255,0.35)",
    chevron: "rgba(255,255,255,0.35)",
    panelBg: "#1b2230",
    panelBorder: "rgba(255,255,255,0.06)",
    panelShadow: "0 12px 32px rgba(0,0,0,0.35)",
    searchBg: "rgba(255,255,255,0.05)",
    searchBorder: "rgba(255,255,255,0.08)",
    itemHover: "rgba(255,255,255,0.06)",
    itemSelected: "rgba(110,120,255,0.18)",
    itemSelectedText: "#ffffff",
  } : {
    triggerBg: "#FFFFFF",
    triggerBorder: "#D1D5DB",
    triggerHoverBg: "#F9FAFB",
    triggerHoverBorder: "#9CA3AF",
    text: "#0F172A",
    textMuted: "#94A3B8",
    textFaint: "#94A3B8",
    chevron: "#9CA3AF",
    panelBg: "#FFFFFF",
    panelBorder: "#D1D5DB",
    panelShadow: "0 12px 32px rgba(0,0,0,0.12)",
    searchBg: "#F8FAFC",
    searchBorder: "#D1D5DB",
    itemHover: "#F1F5F9",
    itemSelected: "color-mix(in srgb, var(--app-accent) 8%, transparent)",
    itemSelectedText: "var(--app-accent)",
  };

  const panel = (
    <div
      ref={panelRef}
      style={{ ...panelStyle, background: c.panelBg, border: `1px solid ${c.panelBorder}`, boxShadow: c.panelShadow }}
      className="overflow-y-auto rounded-xl py-1.5"
      onKeyDown={handleListKey}
      tabIndex={-1}
    >
      {showSearch && (
        <div className="px-2 pb-1.5 pt-0.5">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textFaint }} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setFocusedIdx(0); }}
              placeholder="Поиск..."
              className="w-full pl-7 pr-3 h-8 text-base md:text-[13px] rounded-lg focus:outline-none transition-colors"
              style={{ color: c.text, background: c.searchBg, border: `1px solid ${c.searchBorder}` }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx(0); listRef.current?.focus(); }
                if (e.key === "Escape") { setOpen(false); setSearch(""); triggerRef.current?.focus(); }
              }}
            />
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="px-4 py-3 text-[13px]" style={{ color: c.textFaint }}>Ничего не найдено</p>
      )}

      <div ref={listRef} tabIndex={-1} onKeyDown={handleListKey}>
        {grouped.map((g) => (
          <div key={g.header ?? "__nogroup"}>
            {g.header && (
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: c.textFaint }}>
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
                    background: isSelected ? c.itemSelected : isFocused ? c.itemHover : "transparent",
                    color: isSelected ? c.itemSelectedText : c.text,
                  }}
                >
                  {opt.emoji && <span className="shrink-0 text-[15px] leading-none w-5 text-center">{opt.emoji}</span>}
                  <span className="flex-1 truncate text-[14px] font-[500]">{opt.label}</span>
                  {isSelected && <Check size={13} className="shrink-0" style={{ color: isDark ? "var(--app-accent)" : "var(--app-accent)" }} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {footer && (
        <>
          <div className="mx-2 my-1" style={{ height: 1, background: c.panelBorder }} />
          <div onClick={() => { setOpen(false); setSearch(""); }}>
            {footer}
          </div>
        </>
      )}
    </div>
  );

  const mobileSheet = (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 animate-overlay-fade"
      onClick={() => { setOpen(false); setSearch(""); }}
    >
      <div
        ref={panelRef}
        className="w-full rounded-t-2xl flex flex-col animate-sheet-up overflow-hidden"
        style={{ background: c.panelBg, maxHeight: "70dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: c.textFaint, opacity: 0.5 }} />
        </div>
        <p className="px-5 pb-2 text-[13px] font-semibold shrink-0" style={{ color: c.textMuted }}>
          {placeholder}
        </p>
        {showSearch && (
          <div className="px-4 pb-2 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: c.textFaint }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск..."
                className="w-full pl-7 pr-3 h-9 text-base rounded-lg focus:outline-none"
                style={{ color: c.text, background: c.searchBg, border: `1px solid ${c.searchBorder}` }}
              />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-1">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-[13px]" style={{ color: c.textFaint }}>Ничего не найдено</p>
          )}
          {grouped.map((g) => (
            <div key={g.header ?? "__nogroup"}>
              {g.header && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: c.textFaint }}>
                  {g.header}
                </p>
              )}
              {g.items.map((opt) => {
                const isSelected = opt.value === strValue;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pick(opt.value)}
                    className="w-full flex items-center gap-3 px-3 rounded-xl text-left min-h-[46px] transition-colors active:scale-[0.99]"
                    style={{
                      background: isSelected ? c.itemSelected : "transparent",
                      color: isSelected ? c.itemSelectedText : c.text,
                    }}
                  >
                    {opt.emoji && <span className="shrink-0 text-[17px] leading-none w-6 text-center">{opt.emoji}</span>}
                    <span className="flex-1 truncate text-[15px] font-[500]">{opt.label}</span>
                    {isSelected && <Check size={16} className="shrink-0" style={{ color: "var(--app-accent)" }} />}
                  </button>
                );
              })}
            </div>
          ))}
          {footer && (
            <>
              <div className="mx-2 my-1" style={{ height: 1, background: c.panelBorder }} />
              <div onClick={() => { setOpen(false); setSearch(""); }}>{footer}</div>
            </>
          )}
        </div>
        <div style={{ height: "max(12px, env(safe-area-inset-bottom))" }} className="shrink-0" />
      </div>
    </div>
  );

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setIsMobile(typeof window !== "undefined" && window.innerWidth < 768); setOpen((v) => !v); setFocusedIdx(-1); } }}
        onKeyDown={handleTriggerKey}
        className={`relative w-full flex items-center gap-2 h-11 px-3.5 rounded-xl border transition-all outline-none text-left ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${className}`}
        style={{
          background: c.triggerBg,
          borderColor: c.triggerBorder,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel?.emoji && <span className="shrink-0 text-[15px] leading-none">{selectedLabel.emoji}</span>}
        <span className="flex-1 truncate text-[14px] font-[500] text-left" style={{ color: selectedLabel ? c.text : c.textMuted }}>
          {selectedLabel ? selectedLabel.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className="shrink-0 transition-transform duration-200"
          style={{ color: c.chevron, transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && typeof document !== "undefined" && createPortal(isMobile ? mobileSheet : panel, document.body)}
    </div>
  );
}
