"use client";

import { useState, useRef, useCallback } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { EventDetailPanel } from "@/components/events/EventDetailPanel";
import { useEvents, useCreateEventQuick, useDeleteEvent, useDuplicateEvent } from "@/hooks/useEvents";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import type { EventItem } from "@/types/api";
import {
  CalendarDays, Search, Plus, ChevronLeft, ChevronRight,
  MoreHorizontal, X as XIcon,
} from "lucide-react";
import { clsx } from "clsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const RU_WEEKDAYS_SHORT = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
const RU_MONTHS         = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const RU_MONTHS_FULL    = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

const CAT_PALETTES = [
  { border: "border-l-indigo-500",  icon: "text-indigo-400",  bg: "bg-indigo-500/10" },
  { border: "border-l-emerald-500", icon: "text-emerald-400", bg: "bg-emerald-500/10" },
  { border: "border-l-amber-500",   icon: "text-amber-400",   bg: "bg-amber-500/10" },
  { border: "border-l-rose-500",    icon: "text-rose-400",    bg: "bg-rose-500/10" },
  { border: "border-l-sky-500",     icon: "text-sky-400",     bg: "bg-sky-500/10" },
  { border: "border-l-purple-500",  icon: "text-purple-400",  bg: "bg-purple-500/10" },
];
function catPalette(id: number | null) {
  return CAT_PALETTES[(id ?? 0) % CAT_PALETTES.length];
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function formatDayHeader(iso: string): { label: string; isToday: boolean; weekday: string } {
  const d     = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const isToday = d.getTime() === today.getTime();
  return {
    label: `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`,
    isToday,
    weekday: RU_WEEKDAYS_SHORT[d.getDay()],
  };
}

function formatDateRange(start: string, end: string | null): string | null {
  if (!end || end === start) return null;
  const s = new Date(start + "T00:00:00");
  const e = new Date(end   + "T00:00:00");
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${RU_MONTHS[s.getMonth()]}`;
  return `${s.getDate()} ${RU_MONTHS[s.getMonth()]} – ${e.getDate()} ${RU_MONTHS[e.getMonth()]}`;
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function groupByDate(events: EventItem[]) {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const list = map.get(e.start_date) ?? [];
    list.push(e);
    map.set(e.start_date, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
}

// ── QuickMenu ─────────────────────────────────────────────────────────────────

function QuickMenu({ onOpen, onDuplicate, onDelete }: {
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/[0.08]"
        style={{ color: "var(--t-faint)" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[150px]"
          onMouseLeave={() => setTimeout(() => setOpen(false), 150)}
        >
          {[
            { label: "Редактировать", action: () => { onOpen();      setOpen(false); } },
            { label: "Дублировать",   action: () => { onDuplicate(); setOpen(false); } },
            { label: "Удалить",       action: () => { onDelete();    setOpen(false); }, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={clsx(
                "w-full text-left block px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.05]",
                item.danger ? "text-red-400/80 hover:text-red-400" : "hover:text-white/90"
              )}
              style={{ color: item.danger ? undefined : "var(--t-secondary)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EventRow ──────────────────────────────────────────────────────────────────

function EventRow({ event, onOpen, onDuplicate, onDelete }: {
  event: EventItem;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const palette   = catPalette(event.category_id);
  const isPast    = event.is_past;
  const timeLabel = event.is_all_day ? "Весь день" : (event.start_time ?? "");
  const dateRange = formatDateRange(event.start_date, event.end_date);

  return (
    <div
      onClick={onOpen}
      className={clsx(
        "group flex items-center gap-3 py-3 px-3.5 border-l-2 cursor-pointer transition-colors",
        isPast
          ? "border-l-white/[0.10] opacity-50 hover:opacity-65 hover:bg-white/[0.02]"
          : clsx(palette.border, "hover:bg-white/[0.04]")
      )}
    >
      <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0", isPast ? "bg-white/[0.05]" : palette.bg)}>
        {event.category_emoji ?? "📅"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate leading-snug" style={{
          color: isPast ? "var(--t-muted)" : "var(--t-primary)",
          letterSpacing: "-0.01em",
        }}>
          {event.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {event.category_title && (
            <span className={clsx("text-[11px]", isPast ? "" : palette.icon)} style={{ color: isPast ? "var(--t-faint)" : undefined }}>
              {event.category_title}
            </span>
          )}
          {dateRange && (
            <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>{dateRange}</span>
          )}
        </div>
      </div>
      <span className={clsx("shrink-0 text-[12px] font-medium tabular-nums", event.is_all_day ? "opacity-35" : "")}
        style={{ color: "var(--t-muted)" }}>
        {timeLabel}
      </span>
      <QuickMenu onOpen={onOpen} onDuplicate={onDuplicate} onDelete={onDelete} />
    </div>
  );
}

// ── MiniCalendar ──────────────────────────────────────────────────────────────

function MiniCalendar({ year, month, eventDates, selectedDate, onSelectDate, onPrevMonth, onNextMonth }: {
  year: number; month: number; eventDates: Set<string>;
  selectedDate: string | null; onSelectDate: (d: string | null) => void;
  onPrevMonth: () => void; onNextMonth: () => void;
}) {
  const today       = isoToday();
  const firstDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDow + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function toISO(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 select-none">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors" style={{ color: "var(--t-faint)" }}>
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          {RU_MONTHS_FULL[month]} {year}
        </span>
        <button onClick={onNextMonth} className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors" style={{ color: "var(--t-faint)" }}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => (
          <div key={d} className="text-center text-[10px] font-medium py-1" style={{ color: "var(--t-faint)" }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const iso = toISO(day);
          const isToday    = iso === today;
          const hasEvents  = eventDates.has(iso);
          const isSelected = iso === selectedDate;
          return (
            <button
              key={i}
              onClick={() => onSelectDate(isSelected ? null : iso)}
              className={clsx(
                "relative flex flex-col items-center justify-center h-7 w-full rounded-lg text-[12px] font-medium transition-colors",
                isSelected ? "bg-indigo-600 text-white"
                : isToday  ? "bg-indigo-500/15 text-indigo-400"
                : "hover:bg-white/[0.06]"
              )}
              style={{ color: isSelected || isToday ? undefined : "var(--t-secondary)" }}
            >
              {day}
              {hasEvents && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400/60" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <button
          onClick={() => onSelectDate(null)}
          className="mt-2.5 w-full text-[11px] py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          Показать все →
        </button>
      )}
    </div>
  );
}

// ── QuickAddRow ───────────────────────────────────────────────────────────────

function QuickAddRow({ date }: { date: string }) {
  const [active, setActive] = useState(false);
  const [val, setVal]       = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate: create }  = useCreateEventQuick();

  const submit = useCallback(() => {
    const t = val.trim();
    if (!t) { setActive(false); return; }
    create({ title: t, start_date: date });
    setVal("");
    setActive(false);
  }, [val, date, create]);

  if (!active) {
    return (
      <button
        onClick={() => { setActive(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className="flex items-center gap-1.5 w-full py-1.5 px-3.5 text-[12px] transition-colors hover:bg-white/[0.02]"
        style={{ color: "var(--t-faint)" }}
      >
        <Plus size={11} />
        Добавить событие
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5 px-3.5">
      <Plus size={11} style={{ color: "var(--t-faint)" }} />
      <input
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); submit(); }
          if (e.key === "Escape") { setVal(""); setActive(false); }
        }}
        onBlur={() => { if (!val.trim()) setActive(false); }}
        placeholder="Название события..."
        className="flex-1 bg-transparent outline-none text-[13px] placeholder-white/20"
        style={{ color: "var(--t-secondary)" }}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 14, 30, 60] as const;

export default function EventsPage() {
  const [days, setDays]             = useState<number>(30);
  const [search, setSearch]         = useState("");
  const [catFilter, setCatFilter]   = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showModal, setShowModal]   = useState(false);

  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const { data, isLoading, isError } = useEvents(days);
  const { mutate: deleteEvent }      = useDeleteEvent();
  const { mutate: duplicateEvent }   = useDuplicateEvent();

  const categories = Array.from(
    new Map((data ?? [])
      .filter((e) => e.category_title)
      .map((e) => [e.category_title!, { id: e.category_id, title: e.category_title!, emoji: e.category_emoji }])
    ).values()
  );

  const eventDates = new Set((data ?? []).map((e) => e.start_date));

  const filtered = (data ?? []).filter((e) => {
    if (selectedDate && e.start_date !== selectedDate) return false;
    if (catFilter && e.category_title !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.title.toLowerCase().includes(q) &&
          !(e.description ?? "").toLowerCase().includes(q) &&
          !(e.category_title ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const groups     = groupByDate(filtered);
  const todayCount = (data ?? []).filter((e) => e.is_today).length;
  const upcoming   = (data ?? []).filter((e) => !e.is_past).length;

  const dateSubtitle = now.toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <>
      {selectedEvent && (
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      {showModal && <CreateEventModal onClose={() => setShowModal(false)} />}

      <AppTopbar title="События" subtitle={dateSubtitle} />

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-[900px] flex gap-5 items-start">

          {/* ── Mini calendar (desktop only) ── */}
          <div className="hidden lg:block w-[220px] shrink-0 space-y-4">
            <MiniCalendar
              year={calYear} month={calMonth}
              eventDates={eventDates}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onPrevMonth={() => {
                if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
                else setCalMonth((m) => m - 1);
              }}
              onNextMonth={() => {
                if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
                else setCalMonth((m) => m + 1);
              }}
            />
            {/* Stats */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-[12px]">
                <span style={{ color: "var(--t-faint)" }}>Сегодня</span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>{todayCount}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span style={{ color: "var(--t-faint)" }}>Впереди</span>
                <span className="font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>{upcoming}</span>
              </div>
            </div>
          </div>

          {/* ── Events list ── */}
          <div className="flex-1 min-w-0">

            {/* Controls row */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[160px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--t-faint)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск событий..."
                  className="w-full h-9 pl-8 pr-8 text-[13px] rounded-xl bg-white/[0.04] border border-white/[0.07] focus:outline-none focus:border-indigo-500/40 transition-colors placeholder-white/20"
                  style={{ color: "var(--t-secondary)" }}
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-70" style={{ color: "var(--t-faint)" }}>
                    <XIcon size={12} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
                {DAYS_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={clsx(
                      "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                      days === d ? "bg-indigo-600 text-white" : "text-white/55 hover:text-white/80 hover:bg-white/[0.05]"
                    )}
                  >
                    {d}д
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-xl px-3.5 py-2 transition-colors flex items-center gap-1.5"
              >
                <Plus size={13} strokeWidth={2.5} />
                Событие
              </button>
            </div>

            {/* Category filters */}
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                <button
                  onClick={() => setCatFilter(null)}
                  className={clsx(
                    "px-3 py-1 rounded-full text-[12px] font-medium transition-colors border",
                    !catFilter ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white/[0.04] border-white/[0.07] hover:bg-white/[0.07]"
                  )}
                  style={{ color: catFilter ? "var(--t-secondary)" : undefined }}
                >
                  Все
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.title}
                    onClick={() => setCatFilter(catFilter === cat.title ? null : cat.title)}
                    className={clsx(
                      "px-3 py-1 rounded-full text-[12px] font-medium transition-colors border flex items-center gap-1",
                      catFilter === cat.title
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "bg-white/[0.04] border-white/[0.07] hover:bg-white/[0.07]"
                    )}
                    style={{ color: catFilter === cat.title ? undefined : "var(--t-secondary)" }}
                  >
                    {cat.emoji && <span>{cat.emoji}</span>}
                    {cat.title}
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-20 bg-white/[0.03] rounded-2xl animate-pulse" />
                ))}
              </div>
            )}

            {/* Error */}
            {isError && (
              <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить события</p>
            )}

            {/* Empty */}
            {!isLoading && !isError && groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                  <CalendarDays size={20} style={{ color: "var(--t-faint)" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  {search || catFilter || selectedDate ? "Ничего не найдено" : `Нет событий на ближайшие ${days} дней`}
                </p>
                {!search && !catFilter && !selectedDate && (
                  <button onClick={() => setShowModal(true)} className="text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors">
                    + Создать событие
                  </button>
                )}
              </div>
            )}

            {/* Grouped list */}
            {!isLoading && !isError && groups.length > 0 && (
              <div className="space-y-5">
                {groups.map((g) => {
                  const { label, isToday, weekday } = formatDayHeader(g.date);
                  return (
                    <div key={g.date}>
                      {/* Day header */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={clsx(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-full border",
                          isToday
                            ? "bg-indigo-500/10 border-indigo-500/25"
                            : "bg-white/[0.03] border-white/[0.06]"
                        )}>
                          {isToday && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                          <span className={clsx(
                            "text-[11px] font-semibold uppercase tracking-widest",
                          )} style={{ color: isToday ? "rgb(129,140,248)" : "var(--t-faint)" }}>
                            {isToday ? "Сегодня" : label}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>{weekday}</span>
                        </div>
                        <div className="flex-1 h-px bg-white/[0.04]" />
                        <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>{g.items.length}</span>
                      </div>

                      {/* Event rows */}
                      <div className="space-y-0.5">
                        {g.items.map((e) => (
                          <EventRow
                            key={e.occurrence_id}
                            event={e}
                            onOpen={() => setSelectedEvent(e)}
                            onDuplicate={() => duplicateEvent(e.occurrence_id)}
                            onDelete={() => deleteEvent(e.occurrence_id)}
                          />
                        ))}
                        <QuickAddRow date={g.date} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
