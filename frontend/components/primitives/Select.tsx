"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

export interface SelectOption {
  value: string;
  label: ReactNode;
  emoji?: string;
  group?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  size?: Size;
  disabled?: boolean;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "h-8 text-[13px] px-2.5",
  md: "h-9 text-[13px] px-3",
  lg: "h-11 text-[14px] px-3.5",
};

interface GroupedOptions {
  groupLabel: string | null;
  items: SelectOption[];
}

function groupOptions(options: SelectOption[]): GroupedOptions[] {
  const ungrouped: SelectOption[] = [];
  const groups = new Map<string, SelectOption[]>();
  for (const opt of options) {
    if (!opt.group) {
      ungrouped.push(opt);
    } else {
      const arr = groups.get(opt.group) ?? [];
      arr.push(opt);
      groups.set(opt.group, arr);
    }
  }
  const result: GroupedOptions[] = [];
  if (ungrouped.length) result.push({ groupLabel: null, items: ungrouped });
  for (const [groupLabel, items] of groups) {
    result.push({ groupLabel, items });
  }
  return result;
}

function getLabelText(label: ReactNode): string {
  if (typeof label === "string") return label;
  if (typeof label === "number") return String(label);
  return "";
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Выберите...",
  searchable = false,
  size = "md",
  disabled = false,
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => getLabelText(o.label).toLowerCase().includes(q));
  }, [options, query]);

  const flatNavigable = filtered.filter((o) => !o.disabled);
  const grouped = groupOptions(filtered);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
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

  // Focus search on open
  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    if (open) {
      const idx = flatNavigable.findIndex((o) => o.value === value);
      setActiveIdx(idx >= 0 ? idx : flatNavigable.length > 0 ? 0 : -1);
    } else {
      setQuery("");
      setActiveIdx(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    if (flatNavigable.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatNavigable.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatNavigable.length) % flatNavigable.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = flatNavigable[activeIdx];
      if (opt) commit(opt);
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        className={cn(
          "flex items-center w-full gap-2 rounded-lg border bg-white text-left transition-colors",
          "border-slate-300 dark:border-white/15 dark:bg-white/[0.03]",
          "focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:focus:border-indigo-400",
          "disabled:opacity-50 disabled:pointer-events-none",
          sizeClasses[size],
        )}
      >
        {selected?.emoji && (
          <span aria-hidden className="shrink-0 leading-none">
            {selected.emoji}
          </span>
        )}
        <span
          className={cn(
            "flex-1 truncate",
            selected
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={size === "lg" ? 16 : 14}
          className={cn(
            "shrink-0 text-slate-500 dark:text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 left-0 right-0 rounded-xl border shadow-lg",
            "bg-white border-slate-200 dark:bg-[#1a1d23] dark:border-white/[0.07]",
          )}
        >
          {searchable && (
            <div className="p-2 border-b border-slate-100 dark:border-white/[0.05]">
              <div className="flex items-center gap-2 px-2 h-8 rounded-md bg-slate-50 dark:bg-white/[0.04]">
                <Search size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIdx(0);
                  }}
                  onKeyDown={onListKey}
                  placeholder="Поиск..."
                  className="w-full bg-transparent outline-none text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>
            </div>
          )}

          <div
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onListKey}
            className="max-h-72 overflow-auto p-1 scroll-slim"
          >
            {filtered.length === 0 && (
              <div className="text-[13px] text-slate-400 dark:text-slate-500 px-3 py-2">
                Нет совпадений
              </div>
            )}

            {grouped.map((group, gi) => (
              <div key={gi}>
                {group.groupLabel && (
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-3 pt-2 pb-1">
                    {group.groupLabel}
                  </div>
                )}
                {group.items.map((opt) => {
                  const isSelected = opt.value === value;
                  const navIdx = flatNavigable.indexOf(opt);
                  const isActive = navIdx === activeIdx;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled || undefined}
                      onMouseEnter={() => navIdx !== -1 && setActiveIdx(navIdx)}
                      onClick={() => commit(opt)}
                      className={cn(
                        "flex items-center gap-2 px-3 h-9 rounded-md text-[13px] cursor-pointer select-none",
                        opt.disabled && "opacity-50 pointer-events-none",
                        isActive && !isSelected && "bg-slate-100 dark:bg-white/[0.06]",
                        isSelected
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                          : "text-slate-700 dark:text-slate-200",
                      )}
                    >
                      {opt.emoji && (
                        <span aria-hidden className="shrink-0 leading-none">
                          {opt.emoji}
                        </span>
                      )}
                      <span className="flex-1 truncate">{opt.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
