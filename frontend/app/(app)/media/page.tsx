"use client";

import { useState } from "react";
import { Plus, Star, Pencil, Trash2, BookOpen, Film, Tv, Gamepad2 } from "lucide-react";
import { clsx } from "clsx";
import { useMedia, useUpdateMedia, useDeleteMedia, type MediaEntry } from "@/hooks/useMedia";
import { MediaModal } from "@/components/modals/MediaModal";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";

type MediaType = "book" | "movie" | "series" | "game";
type Status = "want" | "in_progress" | "done";

const TABS: { type: MediaType; label: string; Icon: React.ElementType }[] = [
  { type: "book",   label: "Книги",    Icon: BookOpen  },
  { type: "movie",  label: "Фильмы",   Icon: Film      },
  { type: "series", label: "Сериалы",  Icon: Tv        },
  { type: "game",   label: "Игры",     Icon: Gamepad2  },
];

const STATUS_FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all",         label: "Все" },
  { value: "want",        label: "Хочу" },
  { value: "in_progress", label: "В процессе" },
  { value: "done",        label: "Завершено" },
];

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  want:        { label: "Хочу",        cls: "bg-slate-100 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400" },
  in_progress: { label: "В процессе",  cls: "bg-amber-100 dark:bg-amber-500/[0.12] text-amber-700 dark:text-amber-400" },
  done:        { label: "Завершено",   cls: "bg-emerald-100 dark:bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-400" },
};

const TYPE_PLACEHOLDER: Record<MediaType, React.ElementType> = {
  book: BookOpen, movie: Film, series: Tv, game: Gamepad2,
};

function ReleaseBadge({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d <= today) return null;
  const label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/[0.15] text-indigo-600 dark:text-indigo-400">
      Выйдет {label}
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

function MediaCard({
  entry,
  mediaType,
  onEdit,
}: {
  entry: MediaEntry;
  mediaType: MediaType;
  onEdit: () => void;
}) {
  const { mutate: update } = useUpdateMedia();
  const { mutate: remove } = useDeleteMedia();
  const PlaceholderIcon = TYPE_PLACEHOLDER[mediaType];
  const badge = STATUS_BADGE[entry.status as Status];

  return (
    <div className="group flex gap-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.09] rounded-2xl p-3 hover:border-slate-300 dark:hover:border-white/[0.15] transition-colors">
      {entry.cover_url ? (
        <img src={entry.cover_url} alt="" className="w-14 h-20 object-cover rounded-lg flex-shrink-0" />
      ) : (
        <div className="w-14 h-20 rounded-lg flex-shrink-0 flex items-center justify-center bg-slate-100 dark:bg-white/[0.06]">
          <PlaceholderIcon size={20} className="text-slate-300 dark:text-white/20" />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[14px] font-semibold leading-tight" style={{ color: "var(--t-primary)" }}>
            {entry.title}
          </p>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>{entry.author}</p>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-auto">
          {entry.release_date ? (
            <ReleaseBadge dateStr={entry.release_date} />
          ) : entry.kp_id && entry.status === "want" ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-500/[0.12] text-orange-600 dark:text-orange-400">
              Скоро выйдет
            </span>
          ) : (
            <span className={clsx("text-[11px] font-medium px-2 py-0.5 rounded-full", badge.cls)}>
              {badge.label}
            </span>
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

export default function MediaPage() {
  const [activeType, setActiveType] = useState<MediaType>("movie");
  const [activeStatus, setActiveStatus] = useState<Status | "all">("all");
  const [editEntry, setEditEntry] = useState<MediaEntry | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: entries, isLoading } = useMedia(activeType, activeStatus === "all" ? undefined : activeStatus);

  const { Icon: ActiveIcon } = TABS.find((t) => t.type === activeType)!;

  return (
    <>
      {showCreate && (
        <MediaModal defaultType={activeType} onClose={() => setShowCreate(false)} />
      )}
      {editEntry && (
        <MediaModal entry={editEntry} onClose={() => setEditEntry(null)} />
      )}

      <PageHeader
        title="Медиалог"
        actions={
          <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Добавить
          </Button>
        }
      />

      <main className="flex-1 p-3 md:p-6">
        <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-white/[0.04] rounded-xl p-1 w-fit">
          {TABS.map(({ type, label, Icon }) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all",
                activeType === type
                  ? "bg-white dark:bg-white/[0.10] shadow-sm"
                  : "hover:bg-white/60 dark:hover:bg-white/[0.05]",
              )}
              style={{ color: activeType === type ? "var(--t-primary)" : "var(--t-muted)" }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

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

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" className="h-28 rounded-2xl" />)}
          </div>
        )}

        {!isLoading && entries?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ActiveIcon size={32} className="text-slate-300 dark:text-white/20" />
            <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>
              {activeStatus === "all" ? "Список пуст" : `Ничего со статусом «${STATUS_FILTERS.find(f => f.value === activeStatus)?.label}»`}
            </p>
          </div>
        )}

        {!isLoading && entries && entries.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entries.map((e) => (
              <MediaCard key={e.id} entry={e} mediaType={activeType} onEdit={() => setEditEntry(e)} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
