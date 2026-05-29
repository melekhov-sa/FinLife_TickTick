"use client";

import { useState } from "react";
import { CalendarPlus, MapPin, Trophy, Clock } from "lucide-react";
import { clsx } from "clsx";
import { useFootballMatches, type FootballMatch } from "@/hooks/useFootball";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";

const MONTHS = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
const WEEKDAYS = ["вс","пн","вт","ср","чт","пт","сб"];

const FINISHED = new Set(["FT","AET","PEN","AWD","WO"]);
const LIVE = new Set(["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"]);
const POSTPONED = new Set(["PST"]);
const CANCELLED = new Set(["CANC","ABD"]);

function statusBadge(status: string) {
  if (FINISHED.has(status)) return { label: "Завершён",  cls: "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400" };
  if (LIVE.has(status))     return { label: "Идёт",       cls: "bg-emerald-100 dark:bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-400 animate-pulse" };
  if (POSTPONED.has(status))return { label: "Перенесён",  cls: "bg-amber-100 dark:bg-amber-500/[0.15] text-amber-700 dark:text-amber-400" };
  if (CANCELLED.has(status))return { label: "Отменён",    cls: "bg-red-100 dark:bg-red-500/[0.15] text-red-600 dark:text-red-400" };
  return { label: "Запланирован", cls: "bg-indigo-100 dark:bg-indigo-500/[0.15] text-indigo-600 dark:text-indigo-400" };
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return {
    day: d.getDate(),
    month: MONTHS[d.getMonth()],
    weekday: WEEKDAYS[d.getDay()],
    year: d.getFullYear(),
  };
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isFuture(dateStr: string) {
  return dateStr >= new Date().toISOString().slice(0, 10);
}

function MatchCard({ match, onCreateEvent }: { match: FootballMatch; onCreateEvent: () => void }) {
  const { day, month, weekday, year } = fmtDate(match.match_date);
  const today = isToday(match.match_date);
  const upcoming = isFuture(match.match_date);
  const badge = statusBadge(match.status);
  const isZenitHome = match.home_team.toLowerCase().includes("zenit") || match.home_team.toLowerCase().includes("зенит");
  const currentYear = new Date().getFullYear();

  return (
    <div className={clsx(
      "flex gap-4 p-4 rounded-2xl border transition-colors",
      today
        ? "bg-indigo-50 dark:bg-indigo-500/[0.08] border-indigo-200 dark:border-indigo-500/30"
        : "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.09] hover:border-slate-300 dark:hover:border-white/[0.15]",
    )}>
      {/* Date column */}
      <div className="flex flex-col items-center justify-center w-12 shrink-0 text-center">
        <span className="text-[22px] font-bold leading-none" style={{ color: "var(--t-primary)" }}>{day}</span>
        <span className="text-[12px] font-medium mt-0.5" style={{ color: "var(--t-muted)" }}>{month}</span>
        <span className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>{weekday}</span>
        {year !== currentYear && (
          <span className="text-[10px] mt-0.5" style={{ color: "var(--t-faint)" }}>{year}</span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-slate-200 dark:bg-white/[0.08]" />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Teams */}
        <div className="flex items-center gap-2 mb-2">
          <span className={clsx("text-[15px] font-bold leading-tight", isZenitHome ? "text-indigo-600 dark:text-indigo-400" : "")} style={!isZenitHome ? { color: "var(--t-primary)" } : undefined}>
            {match.home_team}
          </span>
          <span className="text-[13px] font-medium shrink-0" style={{ color: "var(--t-faint)" }}>
            {FINISHED.has(match.status) && match.score_home !== null
              ? `${match.score_home} : ${match.score_away}`
              : "vs"}
          </span>
          <span className={clsx("text-[15px] font-bold leading-tight", !isZenitHome ? "text-indigo-600 dark:text-indigo-400" : "")} style={isZenitHome ? { color: "var(--t-primary)" } : undefined}>
            {match.away_team}
          </span>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", badge.cls)}>
            {badge.label}
          </span>

          {match.match_time && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--t-faint)" }}>
              <Clock size={11} /> {match.match_time}
            </span>
          )}

          <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--t-faint)" }}>
            <Trophy size={11} /> {match.competition}
          </span>

          {match.venue && (
            <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--t-faint)" }}>
              <MapPin size={11} /> {match.venue}
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      {upcoming && !FINISHED.has(match.status) && !CANCELLED.has(match.status) && (
        <button
          onClick={onCreateEvent}
          title="Добавить в события"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors self-center"
          style={{ color: "var(--t-faint)" }}
        >
          <CalendarPlus size={15} />
        </button>
      )}
    </div>
  );
}

export default function FootballPage() {
  const [showRecent, setShowRecent] = useState(false);
  const [eventMatch, setEventMatch] = useState<FootballMatch | null>(null);

  const { data: upcoming, isLoading: loadingUpcoming } = useFootballMatches(true);
  const { data: recent, isLoading: loadingRecent } = useFootballMatches(false);

  const matches = showRecent ? recent : upcoming;
  const isLoading = showRecent ? loadingRecent : loadingUpcoming;

  function buildEventTitle(m: FootballMatch) {
    const isHome = m.home_team.toLowerCase().includes("zenit") || m.home_team.toLowerCase().includes("зенит");
    const opponent = isHome ? m.away_team : m.home_team;
    const location = isHome ? "дома" : "в гостях";
    return `⚽ Зенит vs ${opponent} (${location})`;
  }

  return (
    <>
      {eventMatch && (
        <CreateEventModal
          initialTitle={buildEventTitle(eventMatch)}
          initialDate={isFuture(eventMatch.match_date) ? eventMatch.match_date : ""}
          onClose={() => setEventMatch(null)}
        />
      )}

      <PageHeader title="Матчи Зенита" />

      <main className="flex-1 p-3 md:p-6">
        <div className="max-w-2xl">
          {/* Toggle */}
          <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1 w-fit">
            {[
              { label: "Предстоящие", value: false },
              { label: "Прошедшие",   value: true  },
            ].map(({ label, value }) => (
              <button
                key={String(value)}
                onClick={() => setShowRecent(value)}
                className={clsx(
                  "px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                  showRecent === value
                    ? "bg-white dark:bg-white/[0.10] shadow-sm"
                    : "hover:bg-white/60 dark:hover:bg-white/[0.05]",
                )}
                style={{ color: showRecent === value ? "var(--t-primary)" : "var(--t-muted)" }}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-24 rounded-2xl" />)}
            </div>
          )}

          {!isLoading && (!matches || matches.length === 0) && (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Trophy size={32} className="text-slate-300 dark:text-white/20" />
              <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>
                {showRecent ? "Нет недавних матчей" : "Нет запланированных матчей"}
              </p>
              <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                Добавьте API Football ключ в Настройки → API ключи
              </p>
            </div>
          )}

          {!isLoading && matches && matches.length > 0 && (
            <div className="space-y-2">
              {matches.map((m) => (
                <MatchCard key={m.id} match={m} onCreateEvent={() => setEventMatch(m)} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
