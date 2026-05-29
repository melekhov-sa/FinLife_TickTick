"use client";

import { useState } from "react";
import {
  Plus, Star, Pencil, Trash2, BookOpen, Film, Tv, Gamepad2,
  CalendarPlus, Trophy, Clock, MapPin, RefreshCw, RotateCcw,
} from "lucide-react";
import { clsx } from "clsx";
import { useMedia, useUpdateMedia, useDeleteMedia, useKpRefresh, type MediaEntry } from "@/hooks/useMedia";
import { useFootballMatches, useFootballSync, type FootballMatch } from "@/hooks/useFootball";
import { MediaModal } from "@/components/modals/MediaModal";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";

type MediaType = "book" | "movie" | "series" | "game";
type ActiveTab = MediaType | "football";
type Status = "want" | "in_progress" | "done";

const TABS: { type: ActiveTab; label: string; Icon: React.ElementType }[] = [
  { type: "book",     label: "Книги",   Icon: BookOpen  },
  { type: "movie",    label: "Фильмы",  Icon: Film      },
  { type: "series",   label: "Сериалы", Icon: Tv        },
  { type: "game",     label: "Игры",    Icon: Gamepad2  },
  { type: "football", label: "Матчи",   Icon: Trophy    },
];

const STATUS_FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all",         label: "Все" },
  { value: "want",        label: "Хочу" },
  { value: "in_progress", label: "В процессе" },
  { value: "done",        label: "Завершено" },
];

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  want:        { label: "Хочу",       cls: "bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400" },
  in_progress: { label: "В процессе", cls: "bg-amber-100 dark:bg-amber-500/[0.12] text-amber-700 dark:text-amber-400" },
  done:        { label: "Завершено",  cls: "bg-emerald-100 dark:bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-400" },
};

const TYPE_PLACEHOLDER: Record<MediaType, React.ElementType> = {
  book: BookOpen, movie: Film, series: Tv, game: Gamepad2,
};

// ── Football helpers ──────────────────────────────────────────────────────────

const MONTHS = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
const WEEKDAYS = ["вс","пн","вт","ср","чт","пт","сб"];
const FINISHED = new Set(["FT","AET","PEN","AWD","WO"]);
const LIVE = new Set(["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"]);
const POSTPONED = new Set(["PST"]);
const CANCELLED = new Set(["CANC","ABD"]);

function footballStatusBadge(status: string) {
  if (FINISHED.has(status))  return { label: "Завершён",    cls: "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400" };
  if (LIVE.has(status))      return { label: "Идёт",        cls: "bg-emerald-100 dark:bg-emerald-500/[0.15] text-emerald-600 dark:text-emerald-400 animate-pulse" };
  if (POSTPONED.has(status)) return { label: "Перенесён",   cls: "bg-amber-100 dark:bg-amber-500/[0.15] text-amber-700 dark:text-amber-400" };
  if (CANCELLED.has(status)) return { label: "Отменён",     cls: "bg-red-100 dark:bg-red-500/[0.15] text-red-600 dark:text-red-400" };
  return { label: "Запланирован", cls: "bg-indigo-100 dark:bg-indigo-500/[0.15] text-indigo-600 dark:text-indigo-400" };
}

function fmtMatchDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return { day: d.getDate(), month: MONTHS[d.getMonth()], weekday: WEEKDAYS[d.getDay()], year: d.getFullYear() };
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isFutureDate(dateStr: string) {
  return dateStr >= new Date().toISOString().slice(0, 10);
}

function buildMatchEventTitle(m: FootballMatch) {
  const isHome = m.home_team.toLowerCase().includes("zenit") || m.home_team.toLowerCase().includes("зенит");
  const opponent = isHome ? m.away_team : m.home_team;
  const location = isHome ? "дома" : "в гостях";
  return `⚽ Зенит vs ${opponent} (${location})`;
}

function MatchCard({ match, onCreateEvent }: { match: FootballMatch; onCreateEvent: () => void }) {
  const { day, month, weekday, year } = fmtMatchDate(match.match_date);
  const today = isToday(match.match_date);
  const upcoming = isFutureDate(match.match_date);
  const badge = footballStatusBadge(match.status);
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
        <div className="flex items-center gap-2 mb-2">
          <span
            className={clsx("text-[15px] font-bold leading-tight", isZenitHome ? "text-indigo-600 dark:text-indigo-400" : "")}
            style={!isZenitHome ? { color: "var(--t-primary)" } : undefined}
          >
            {match.home_team}
          </span>
          <span className="text-[13px] font-medium shrink-0" style={{ color: "var(--t-faint)" }}>
            {FINISHED.has(match.status) && match.score_home !== null
              ? `${match.score_home} : ${match.score_away}`
              : "vs"}
          </span>
          <span
            className={clsx("text-[15px] font-bold leading-tight", !isZenitHome ? "text-indigo-600 dark:text-indigo-400" : "")}
            style={isZenitHome ? { color: "var(--t-primary)" } : undefined}
          >
            {match.away_team}
          </span>
        </div>

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

      {/* Add to calendar */}
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

// ── Media helpers ─────────────────────────────────────────────────────────────

function ReleaseBadge({ dateStr, source }: { dateStr: string; source?: string | null }) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d <= today) return null;
  const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  const isWorld = source === "world";
  return (
    <span className={clsx(
      "text-[11px] font-semibold px-2 py-0.5 rounded-full",
      isWorld
        ? "bg-amber-100 dark:bg-amber-500/[0.15] text-amber-600 dark:text-amber-400"
        : "bg-indigo-100 dark:bg-indigo-500/[0.15] text-indigo-600 dark:text-indigo-400",
    )}>
      {isWorld ? `Мировая ${label}` : `Выйдет ${label}`}
    </span>
  );
}

function Stars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={11} className={n <= value ? "text-amber-400 fill-amber-400" : "text-slate-200 dark:text-white/10"} />
      ))}
    </div>
  );
}

function CoverPlaceholder({ Icon }: { Icon: React.ElementType }) {
  return (
    <div className="w-14 h-20 rounded-lg flex-shrink-0 flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-white/[0.06]">
      <Icon size={16} className="text-slate-300 dark:text-white/20" />
      <span className="text-[9px] font-medium text-slate-300 dark:text-white/20 text-center leading-tight px-0.5">
        Без<br />обложки
      </span>
    </div>
  );
}

function ReleasedBadge({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("ru-RU", {
    day: "numeric", month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400">
      Вышел {label}
    </span>
  );
}

function NextEpisodeBadge({ dateStr, label }: { dateStr: string; label: string | null }) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d <= today) return null;
  const fmtDate = d.toLocaleDateString("ru-RU", {
    day: "numeric", month: "short",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/[0.15] text-violet-600 dark:text-violet-400">
      {label ? `${label} · ` : ""}{fmtDate}
    </span>
  );
}

function MediaCard({
  entry,
  mediaType,
  onEdit,
  onCreateEvent,
}: {
  entry: MediaEntry;
  mediaType: MediaType;
  onEdit: () => void;
  onCreateEvent: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const { mutate: update } = useUpdateMedia();
  const { mutate: remove } = useDeleteMedia();
  const { mutate: kpRefresh, isPending: refreshing } = useKpRefresh();
  const PlaceholderIcon = TYPE_PLACEHOLDER[mediaType];
  const badge = STATUS_BADGE[entry.status as Status];
  const hasKp = !!(entry.kp_id && (mediaType === "movie" || mediaType === "series"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const releaseIsFuture = entry.release_date
    ? new Date(entry.release_date + "T00:00:00") > today
    : false;
  const nextEpIsFuture = entry.next_episode_date
    ? new Date(entry.next_episode_date + "T00:00:00") > today
    : false;

  return (
    <div className="group flex gap-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.09] rounded-2xl p-3 hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors">
      {entry.cover_url && !imgError ? (
        <img
          src={entry.cover_url}
          alt=""
          className="w-14 h-20 object-cover rounded-lg flex-shrink-0"
          onError={() => setImgError(true)}
        />
      ) : (
        <CoverPlaceholder Icon={PlaceholderIcon} />
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--t-primary)" }}>
            {entry.title}
          </p>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {hasKp && (
              <button
                onClick={() => kpRefresh(entry.id)}
                disabled={refreshing}
                title="Обновить с Кинопоиска"
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-500 transition-colors"
                style={{ color: "var(--t-faint)" }}
              >
                <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
              </button>
            )}
            <button
              onClick={onCreateEvent}
              title="Идём в кино"
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <CalendarPlus size={11} />
            </button>
            <button
              onClick={onEdit}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={() => remove(entry.id)}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>

        {entry.author && (
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            {entry.author}
            {entry.episodes_count ? (
              <span className="ml-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>· {entry.episodes_count} сер.</span>
            ) : null}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-auto">
          <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
            {badge.label}
          </span>
          {releaseIsFuture && (
            <ReleaseBadge dateStr={entry.release_date!} source={entry.release_date_source} />
          )}
          {!releaseIsFuture && entry.release_date && (mediaType === "movie" || mediaType === "series") && (
            <ReleasedBadge dateStr={entry.release_date} />
          )}
          {!releaseIsFuture && !entry.release_date && entry.kp_id && entry.status === "want" && (mediaType === "movie" || mediaType === "series") && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-500/[0.12] text-orange-600 dark:text-orange-400">
              Скоро выйдет
            </span>
          )}
          {nextEpIsFuture && (
            <NextEpisodeBadge dateStr={entry.next_episode_date!} label={entry.next_episode_label} />
          )}
          <Stars value={entry.rating} />
        </div>

        {entry.note && (
          <p className="text-[11px] italic line-clamp-2" style={{ color: "var(--t-faint)" }}>{entry.note}</p>
        )}

        <div className="flex gap-1.5 mt-1">
          {(["want", "in_progress", "done"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => update({ id: entry.id, status: s })}
              className={clsx(
                "w-2 h-2 rounded-full transition-all",
                entry.status === s
                  ? s === "want" ? "bg-slate-400" : s === "in_progress" ? "bg-amber-400" : "bg-emerald-400"
                  : "bg-slate-200 dark:bg-white/[0.10] hover:opacity-70",
              )}
              title={STATUS_BADGE[s].label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function sortByRelease(entries: MediaEntry[]): MediaEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [...entries].sort((a, b) => {
    const ra = a.release_date ? new Date(a.release_date + "T00:00:00") : null;
    const rb = b.release_date ? new Date(b.release_date + "T00:00:00") : null;
    const au = ra && ra > today;
    const bu = rb && rb > today;
    if (au && bu) return ra!.getTime() - rb!.getTime();
    if (au) return -1;
    if (bu) return 1;
    return 0;
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("movie");
  const [activeStatus, setActiveStatus] = useState<Status | "all">("all");
  const [editEntry, setEditEntry] = useState<MediaEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [cinemaEntry, setCinemaEntry] = useState<MediaEntry | null>(null);
  const [showRecentMatches, setShowRecentMatches] = useState(false);
  const [eventMatch, setEventMatch] = useState<FootballMatch | null>(null);

  const isFootball = activeTab === "football";
  const mediaType = isFootball ? undefined : (activeTab as MediaType);

  const { data: entries, isLoading: mediaLoading } = useMedia(
    mediaType,
    activeStatus === "all" ? undefined : activeStatus,
    { enabled: !isFootball },
  );

  const { data: footballMatches, isLoading: footballLoading } = useFootballMatches(!showRecentMatches);
  const { mutate: syncFootball, isPending: syncing } = useFootballSync();

  const { Icon: ActiveIcon } = TABS.find((t) => t.type === activeTab)!;

  return (
    <>
      {showCreate && (
        <MediaModal defaultType={mediaType ?? "movie"} onClose={() => setShowCreate(false)} />
      )}
      {editEntry && (
        <MediaModal entry={editEntry} onClose={() => setEditEntry(null)} />
      )}
      {cinemaEntry && (
        <CreateEventModal
          initialTitle={`Идём в кино на «${cinemaEntry.title}»`}
          initialDate={cinemaEntry.release_date && new Date(cinemaEntry.release_date + "T00:00:00") > new Date() ? cinemaEntry.release_date : ""}
          onClose={() => setCinemaEntry(null)}
        />
      )}
      {eventMatch && (
        <CreateEventModal
          initialTitle={buildMatchEventTitle(eventMatch)}
          initialDate={isFutureDate(eventMatch.match_date) ? eventMatch.match_date : ""}
          onClose={() => setEventMatch(null)}
        />
      )}

      <PageHeader
        title="Медиалог"
        actions={
          !isFootball ? (
            <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
              Добавить
            </Button>
          ) : undefined
        }
      />

      <main className="flex-1 p-3 md:p-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1 w-fit">
          {TABS.map(({ type, label, Icon }) => (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                activeTab === type
                  ? "bg-white dark:bg-white/[0.10] shadow-sm"
                  : "hover:bg-white/60 dark:hover:bg-white/[0.05]",
              )}
              style={{ color: activeTab === type ? "var(--t-primary)" : "var(--t-muted)" }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Football tab content */}
        {isFootball && (
          <div className="max-w-2xl">
            {/* Recent / Upcoming toggle + sync button */}
            <div className="flex items-center gap-3 mb-5">
            <div className="flex gap-1 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1 w-fit">
              {[
                { label: "Предстоящие", value: false },
                { label: "Прошедшие",   value: true  },
              ].map(({ label, value }) => (
                <button
                  key={String(value)}
                  onClick={() => setShowRecentMatches(value)}
                  className={clsx(
                    "px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                    showRecentMatches === value
                      ? "bg-white dark:bg-white/[0.10] shadow-sm"
                      : "hover:bg-white/60 dark:hover:bg-white/[0.05]",
                  )}
                  style={{ color: showRecentMatches === value ? "var(--t-primary)" : "var(--t-muted)" }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => syncFootball()}
              disabled={syncing}
              title="Синхронизировать матчи с AllSportsAPI"
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08] disabled:opacity-40"
              style={{ color: "var(--t-faint)" }}
            >
              <RotateCcw size={15} className={syncing ? "animate-spin" : ""} />
            </button>
            </div>

            {footballLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-24 rounded-2xl" />)}
              </div>
            )}

            {!footballLoading && (!footballMatches || footballMatches.length === 0) && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Trophy size={32} className="text-slate-300 dark:text-white/20" />
                <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>
                  {showRecentMatches ? "Нет недавних матчей" : "Нет запланированных матчей"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                  Если ключ AllSportsAPI добавлен — нажмите синхронизировать
                </p>
                <button
                  onClick={() => syncFootball()}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-50 text-white mt-1"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                >
                  <RotateCcw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Загружаем матчи…" : "Синхронизировать"}
                </button>
              </div>
            )}

            {!footballLoading && footballMatches && footballMatches.length > 0 && (
              <div className="space-y-2">
                {footballMatches.map((m) => (
                  <MatchCard key={m.id} match={m} onCreateEvent={() => setEventMatch(m)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Media tab content */}
        {!isFootball && (
          <>
            <div className="flex gap-1 mb-5">
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setActiveStatus(value)}
                  className={clsx(
                    "px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors",
                    activeStatus === value
                      ? "bg-indigo-500 text-white"
                      : "hover:bg-slate-100 dark:hover:bg-white/[0.08]",
                  )}
                  style={activeStatus !== value ? { color: "var(--t-muted)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            {mediaLoading && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" className="h-28 rounded-2xl" />)}
              </div>
            )}

            {!mediaLoading && entries?.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <ActiveIcon size={32} className="text-slate-300 dark:text-white/20" />
                <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>
                  {activeStatus === "all" ? "Список пуст" : `Ничего со статусом «${STATUS_FILTERS.find(f => f.value === activeStatus)?.label}»`}
                </p>
              </div>
            )}

            {!mediaLoading && entries && entries.length > 0 && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {((activeTab === "movie" || activeTab === "series") ? sortByRelease(entries) : entries).map((e) => (
                  <MediaCard
                    key={e.id}
                    entry={e}
                    mediaType={activeTab as MediaType}
                    onEdit={() => setEditEntry(e)}
                    onCreateEvent={() => setCinemaEntry(e)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
