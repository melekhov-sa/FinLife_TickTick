"use client";

import { clsx } from "clsx";
import { CheckCircle2, Circle } from "lucide-react";
import type { WeekEvent } from "@/types/api";
import { pluralizeYears } from "@/lib/utils";
import { useCompleteEvent, useUncompleteEvent } from "@/hooks/useEvents";

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
  const complete = useCompleteEvent();
  const uncomplete = useUncompleteEvent();

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] shadow-sm p-4">
      <p className="text-[14px] font-semibold mb-3" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        События на неделе
      </p>

      {events.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: "var(--t-faint)" }}>Нет событий на ближайшие 7 дней</p>
      ) : (
        <div className="space-y-0.5">
          {events.map((ev) => {
            const isManual = ev.completion_mode === "manual";
            const isPending = complete.isPending || uncomplete.isPending;

            return (
              <div
                key={ev.occurrence_id}
                className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] last:border-0"
              >
                <div
                  className={clsx(
                    "w-0.5 self-stretch min-h-[32px] rounded-full shrink-0 mt-0.5",
                    ev.is_today
                      ? "bg-[var(--app-accent)] shadow-[0_0_6px_color-mix(in srgb, var(--app-accent) 50%, transparent)]"
                      : "bg-white/[0.10]"
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={clsx("t-main leading-snug", ev.is_completed && "line-through opacity-50")}
                    style={{ color: ev.is_today ? "var(--t-primary)" : "var(--t-secondary)" }}
                  >
                    {ev.category_emoji && <span className="mr-1">{ev.category_emoji}</span>}
                    {ev.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="t-secondary" style={{ color: "var(--t-muted)" }}>
                      {formatEventDate(ev.start_date, ev.is_today)}
                      {ev.start_time && (
                        <span className="ml-1.5 tabular-nums">{ev.start_time.slice(0, 5)}</span>
                      )}
                    </span>
                    {ev.person_age != null && (
                      <span className={clsx(
                        "text-[11px] font-semibold",
                        ev.is_jubilee ? "text-amber-400" : "text-pink-400",
                      )}>
                        {ev.is_jubilee ? "🎉 " : ""}{ev.person_age} {pluralizeYears(ev.person_age)}
                      </span>
                    )}
                  </div>
                </div>

                {isManual && (
                  <button
                    disabled={isPending}
                    onClick={() => ev.is_completed
                      ? uncomplete.mutate(ev.occurrence_id)
                      : complete.mutate(ev.occurrence_id)
                    }
                    className="shrink-0 mt-0.5 transition-colors disabled:opacity-40"
                    style={{ color: ev.is_completed ? "var(--color-emerald-500, #10b981)" : "var(--t-faint)" }}
                    title={ev.is_completed ? "Отменить выполнение" : "Отметить как выполненное"}
                  >
                    {ev.is_completed
                      ? <CheckCircle2 size={18} />
                      : <Circle size={18} />
                    }
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a href="/events" className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors" style={{ color: "var(--t-muted)" }}>
          Все события →
        </a>
      </div>
    </div>
  );
}
