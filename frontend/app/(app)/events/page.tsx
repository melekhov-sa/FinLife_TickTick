"use client";

import { useState } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useEvents } from "@/hooks/useEvents";
import type { EventItem } from "@/types/api";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { CalendarDays, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

const RU_WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const RU_MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}, ${RU_WEEKDAYS[d.getDay()]}`;
}

function groupByDate(events: EventItem[]): { date: string; label: string; items: EventItem[] }[] {
  const map = new Map<string, EventItem[]>();
  for (const e of events) {
    const list = map.get(e.start_date) ?? [];
    list.push(e);
    map.set(e.start_date, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, label: formatDate(date), items }));
}

function EventRow({ event }: { event: EventItem }) {
  return (
    <div className={clsx(
      "flex items-center gap-3.5 py-3 px-3.5 rounded-xl border-l-2 transition-colors",
      event.is_today
        ? "border-l-indigo-500 bg-indigo-500/[0.04] hover:bg-indigo-500/[0.07]"
        : event.is_past
        ? "border-l-white/[0.08] bg-white/[0.02] hover:bg-white/[0.03] opacity-60"
        : "border-l-white/20 bg-white/[0.03] hover:bg-white/[0.05]"
    )}>
      <div className="w-9 h-9 rounded-xl bg-white/[0.07] flex items-center justify-center text-base shrink-0">
        {event.category_emoji ?? "📅"}
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx(
          "text-sm font-medium truncate",
          event.is_past ? "text-white/45" : "text-white/85"
        )} style={{ letterSpacing: "-0.01em" }}>
          {event.title}
        </div>
        {event.category_title && (
          <div className="text-[11px] text-white/35 mt-0.5">{event.category_title}</div>
        )}
      </div>
      <div className="text-right shrink-0">
        {event.is_all_day ? (
          <span className="text-[10px] font-medium text-white/30 uppercase tracking-widest">весь день</span>
        ) : (
          <span className="text-xs font-semibold text-white/50 tabular-nums">{event.start_time}</span>
        )}
      </div>
    </div>
  );
}

const DAYS_OPTIONS = [7, 14, 30] as const;

export default function EventsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [days, setDays] = useState<number>(14);
  const { data, isLoading, isError } = useEvents(days);

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const groups = data ? groupByDate(data) : [];
  const todayCount = data?.filter((e) => e.is_today).length ?? 0;
  const upcoming = data?.filter((e) => !e.is_past).length ?? 0;

  return (
    <>
      {showCreateModal && <CreateEventModal onClose={() => setShowCreateModal(false)} />}
      <AppTopbar title="События" subtitle={dateSubtitle} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[760px]">
          {/* Controls */}
          <div className="flex items-center gap-3 mb-6">
            {/* Days filter */}
            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={clsx(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    days === d
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
                  )}
                >
                  {d}д
                </button>
              ))}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-xs text-white/35">
              <span>Сегодня: <strong className="text-white/65">{todayCount}</strong></span>
              <span>Впереди: <strong className="text-white/65">{upcoming}</strong></span>
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
            >
              + Событие
            </button>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-white/40 text-sm text-center mt-12">
              Не удалось загрузить события
            </div>
          )}

          {data && groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                <CalendarDays size={20} className="text-white/25" />
              </div>
              <p className="text-sm text-white/30 font-medium">Нет событий на ближайшие {days} дней</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                + Создать событие
              </button>
            </div>
          )}

          {data && groups.length > 0 && (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.date}>
                  <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2.5">
                    {g.label}
                  </p>
                  <div className="space-y-1.5">
                    {g.items.map((e) => (
                      <EventRow key={e.occurrence_id} event={e} />
                    ))}
                  </div>
                </div>
              ))}

              <a
                href="/legacy/events"
                className="flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/55 transition-colors py-2"
              >
                Управление событиями <ArrowRight size={12} />
              </a>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
