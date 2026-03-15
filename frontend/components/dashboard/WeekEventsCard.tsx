"use client";

import { clsx } from "clsx";
import type { WeekEvent } from "@/types/api";

interface Props {
  events: WeekEvent[];
}

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatEventDate(iso: string, isToday: boolean): string {
  if (isToday) return "Сегодня";
  const d = new Date(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function WeekEventsCard({ events }: Props) {
  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4">
      <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3">
        События на неделе
      </p>

      {events.length === 0 ? (
        <p className="text-xs text-white/50 py-2">Нет событий на ближайшие 7 дней</p>
      ) : (
        <div className="space-y-0.5">
          {events.map((ev) => (
            <div
              key={ev.occurrence_id}
              className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] last:border-0"
            >
              <div
                className={clsx(
                  "w-0.5 self-stretch min-h-[32px] rounded-full shrink-0 mt-0.5",
                  ev.is_today
                    ? "bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]"
                    : "bg-white/[0.10]"
                )}
              />
              <div className="flex-1 min-w-0">
                <p className={clsx(
                  "text-[13px] font-medium truncate leading-snug",
                  ev.is_today ? "text-white/88" : "text-white/62"
                )}>
                  {ev.category_emoji && <span className="mr-1">{ev.category_emoji}</span>}
                  {ev.title}
                </p>
                <p className="text-[11px] text-white/58 mt-0.5">
                  {formatEventDate(ev.start_date, ev.is_today)}
                  {ev.start_time && (
                    <span className="ml-1.5 tabular-nums">{ev.start_time.slice(0, 5)}</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a href="/events" className="text-[11px] font-medium text-white/58 hover:text-indigo-400 transition-colors">
          Все события →
        </a>
      </div>
    </div>
  );
}
