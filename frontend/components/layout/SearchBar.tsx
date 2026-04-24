"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ClipboardList, Calendar, Wallet, CircleDollarSign, Heart, Target, Repeat, Users, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SearchResultItem {
  id: number;
  title: string;
  subtitle: string | null;
  date: string | null;
  url: string;
  is_archived: boolean;
}

interface SearchResponse {
  tasks: SearchResultItem[];
  events: SearchResultItem[];
  operations: SearchResultItem[];
  transactions: SearchResultItem[];
  habits: SearchResultItem[];
  goals: SearchResultItem[];
  subscriptions: SearchResultItem[];
  contacts: SearchResultItem[];
  articles: SearchResultItem[];
  total: number;
}

type ResultKind =
  | "task"
  | "event"
  | "operation"
  | "transaction"
  | "habit"
  | "goal"
  | "subscription"
  | "contact"
  | "article";

interface FlatResult extends SearchResultItem {
  kind: ResultKind;
}

// Response key for each kind (events → "events", task → "tasks" etc.)
const KIND_TO_KEY: Record<ResultKind, keyof Omit<SearchResponse, "total">> = {
  task: "tasks",
  event: "events",
  operation: "operations",
  transaction: "transactions",
  habit: "habits",
  goal: "goals",
  subscription: "subscriptions",
  contact: "contacts",
  article: "articles",
};

// Display order in the dropdown
const KIND_ORDER: ResultKind[] = [
  "task",
  "event",
  "operation",
  "transaction",
  "habit",
  "goal",
  "subscription",
  "contact",
  "article",
];

const KIND_ICONS: Record<ResultKind, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  task: ClipboardList,
  event: Calendar,
  operation: CircleDollarSign,
  transaction: Wallet,
  habit: Heart,
  goal: Target,
  subscription: Repeat,
  contact: Users,
  article: FileText,
};

const KIND_LABELS: Record<ResultKind, string> = {
  task: "Задачи",
  event: "События",
  operation: "Операции",
  transaction: "Транзакции",
  habit: "Привычки",
  goal: "Цели",
  subscription: "Подписки",
  contact: "Контакты",
  article: "Заметки",
};

const KIND_BADGE: Record<ResultKind, { label: string; className: string }> = {
  task: { label: "Задача", className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  event: { label: "Событие", className: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" },
  operation: { label: "Операция", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  transaction: { label: "Транзакция", className: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  habit: { label: "Привычка", className: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  goal: { label: "Цель", className: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  subscription: { label: "Подписка", className: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  contact: { label: "Контакт", className: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  article: { label: "Заметка", className: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200" },
};

export function SearchBar() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mobileInputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setActiveIdx(null);
  }, [debouncedQuery]);

  const { data, isPending, isError } = useQuery<SearchResponse>({
    queryKey: ["search", debouncedQuery],
    queryFn: () =>
      api.get<SearchResponse>(`/api/v2/search?q=${encodeURIComponent(debouncedQuery)}`),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  const flat = useMemo<FlatResult[]>(() => {
    if (!data) return [];
    const out: FlatResult[] = [];
    for (const kind of KIND_ORDER) {
      const items = data[KIND_TO_KEY[kind]] ?? [];
      for (const it of items) out.push({ ...it, kind });
    }
    return out;
  }, [data]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  // Focus mobile input on open
  useEffect(() => {
    if (mobileOpen) {
      setTimeout(() => mobileInputRef.current?.focus(), 50);
    }
  }, [mobileOpen]);

  function go(url: string) {
    router.push(url);
    setIsOpen(false);
    setMobileOpen(false);
    setQuery("");
    setDebouncedQuery("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((prev) => Math.min((prev ?? -1) + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((prev) => Math.max((prev ?? 1) - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx !== null && flat[activeIdx]) {
        go(flat[activeIdx].url);
      } else if (flat.length > 0) {
        go(flat[0].url);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setMobileOpen(false);
      inputRef.current?.blur();
    }
  }

  const showDropdown = isOpen && debouncedQuery.length >= 2;
  const noResults = data && data.total === 0 && !isPending;

  const dropdownContent = (
    <>
      {isPending && (
        <div className="px-4 py-4 text-[13px]" style={{ color: "var(--t-muted)" }}>
          Ищем…
        </div>
      )}
      {isError && !isPending && (
        <div className="px-4 py-4 text-[13px] text-red-500">Ошибка поиска</div>
      )}
      {noResults && (
        <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--t-muted)" }}>
          Ничего не найдено
        </div>
      )}
      {data && data.total > 0 && (
        <ResultGroups data={data} flat={flat} activeIdx={activeIdx} onPick={go} />
      )}
    </>
  );

  return (
    <>
      {/* Desktop: inline поле в топбаре */}
      <div ref={rootRef} className="relative hidden sm:block">
        <div className="relative">
          <Search
            size={15}
            strokeWidth={1.9}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.75)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Поиск"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={onKeyDown}
            className={cn(
              "h-9 w-[220px] lg:w-[280px] rounded-lg pl-9 pr-8 text-[13px]",
              "bg-white/15 hover:bg-white/20 focus:bg-white/25 transition-colors",
              "text-white placeholder-white/60",
              "outline-none focus:ring-2 focus:ring-white/30"
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDebouncedQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Очистить"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors text-white/80"
            >
              <X size={12} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {showDropdown && (
          <div
            role="listbox"
            className="absolute right-0 top-full mt-2 w-[400px] max-h-[480px] overflow-auto scroll-slim rounded-xl border shadow-xl z-50"
            style={{
              background: "var(--app-card-bg)",
              borderColor: "var(--app-card-border)",
              boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 16px 40px -8px rgba(16,24,40,.2)",
            }}
          >
            {dropdownContent}
          </div>
        )}
      </div>

      {/* Mobile: иконка */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Поиск"
        className="sm:hidden relative w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/15 text-white"
      >
        <Search size={17} strokeWidth={1.9} />
      </button>

      {/* Mobile fullscreen overlay */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-[60] flex flex-col"
          style={{ background: "var(--app-bg)" }}
        >
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-2 border-b"
            style={{
              background: "var(--app-topbar-bg)",
              borderColor: "transparent",
              paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setQuery("");
                setDebouncedQuery("");
              }}
              aria-label="Закрыть"
              className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center hover:bg-white/15 text-white"
            >
              <X size={18} strokeWidth={1.9} />
            </button>
            <div className="relative flex-1">
              <Search
                size={15}
                strokeWidth={1.9}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/75"
              />
              <input
                ref={mobileInputRef}
                type="text"
                value={query}
                placeholder="Поиск"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                className="h-9 w-full rounded-lg pl-9 pr-3 text-[14px] bg-white/15 focus:bg-white/25 text-white placeholder-white/60 outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto scroll-slim">{dropdownContent}</div>
        </div>
      )}
    </>
  );
}

function ResultGroups({
  data,
  flat,
  activeIdx,
  onPick,
}: {
  data: SearchResponse;
  flat: FlatResult[];
  activeIdx: number | null;
  onPick: (url: string) => void;
}) {
  let offset = 0;
  return (
    <div className="py-1">
      {KIND_ORDER.map((kind) => {
        const items = data[KIND_TO_KEY[kind]] ?? [];
        if (items.length === 0) {
          return null;
        }
        const groupStart = offset;
        offset += items.length;
        const Icon = KIND_ICONS[kind];
        return (
          <div key={kind} className="py-1">
            <div
              className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--t-faint)" }}
            >
              {KIND_LABELS[kind]}
            </div>
            {items.map((it, i) => {
              const globalIdx = groupStart + i;
              const isActive = globalIdx === activeIdx;
              const isActiveFlat = flat[activeIdx ?? -1]?.id === it.id && flat[activeIdx ?? -1]?.kind === kind;
              const badge = KIND_BADGE[kind];
              return (
                <button
                  key={`${kind}-${it.id}`}
                  type="button"
                  role="option"
                  aria-selected={isActive || isActiveFlat}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(it.url);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                    (isActive || isActiveFlat) ? "nav-active" : "nav-hover"
                  )}
                >
                  <Icon size={16} strokeWidth={1.8} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13px] font-medium truncate"
                      style={{ color: "var(--t-primary)" }}
                    >
                      {it.title}
                    </div>
                    {it.subtitle && (
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--t-muted)" }}
                      >
                        {it.subtitle}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                    {it.is_archived && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        Архив
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
