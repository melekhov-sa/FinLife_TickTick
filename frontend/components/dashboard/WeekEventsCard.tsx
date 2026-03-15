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
  if (events.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <h2
          className="text-sm font-semibold text-white/85 mb-3"
          style={{ letterSpacing: "-0.01em" }}
        >
          События на неделе
        </h2>
        <p className="text-xs text-white/25 text-center py-3">Нет событий на ближайшие 7 дней</p>
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <a href="/events" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
            Все события →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h2
        className="text-sm font-semibold text-white/85 mb-4"
        style={{ letterSpacing: "-0.01em" }}
      >
        События на неделе
      </h2>
      <div className="space-y-1">
        {events.map((ev, i) => (
          <div
            key={ev.occurrence_id}
            className={clsx(
              "flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-1.5 -mx-1.5 transition-colors",
            )}
          >
            <div
              className={clsx(
                "w-0.5 self-stretch min-h-[36px] rounded-full shrink-0",
                ev.is_today
                  ? "bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                  : "bg-white/[0.12]"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className={clsx(
                "text-sm font-medium truncate",
                ev.is_today ? "text-white/90" : "text-white/65"
              )}>
                {ev.category_emoji && <span className="mr-1">{ev.category_emoji}</span>}
                {ev.title}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {formatEventDate(ev.start_date, ev.is_today)}
                {ev.start_time && (
                  <span className="ml-1.5 font-medium tabular-nums">{ev.start_time.slice(0, 5)}</span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/[0.05]">
        <a href="/events" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
          Все события →
        </a>
      </div>
    </div>
  );
}
