"use client";

import { useState, useEffect } from "react";
import { X, Search, Star } from "lucide-react";
import { useCreateMedia, useUpdateMedia, useLookupMedia, useKpPremiere, type MediaEntry, type LookupResult } from "@/hooks/useMedia";

type MediaType = "book" | "movie" | "series" | "game";
type Status = "want" | "in_progress" | "done";

const TYPE_LABELS: Record<MediaType, string> = {
  book: "Книга", movie: "Фильм", series: "Сериал", game: "Игра",
};

const STATUS_LABELS: Record<Status, string> = {
  want: "Хочу", in_progress: "В процессе", done: "Завершено",
};

const STATUS_COLORS: Record<Status, string> = {
  want: "bg-slate-500",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
};

interface Props {
  entry?: MediaEntry;
  defaultType?: MediaType;
  onClose: () => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(value === n ? 0 : n)}
          className="transition-colors"
        >
          <Star
            size={20}
            className={(hovered || value) >= n ? "text-amber-400 fill-amber-400" : "text-slate-300 dark:text-white/20"}
          />
        </button>
      ))}
    </div>
  );
}

export function MediaModal({ entry, defaultType = "movie", onClose }: Props) {
  const isEdit = !!entry;
  const [type, setType] = useState<MediaType>((entry?.media_type as MediaType) ?? defaultType);
  const [query, setQuery] = useState(entry?.title ?? "");
  const [selected, setSelected] = useState<{ title: string; author: string | null; cover_url: string | null; kp_id?: number | null } | null>(
    entry ? { title: entry.title, author: entry.author, cover_url: entry.cover_url } : null,
  );
  const [status, setStatus] = useState<Status>((entry?.status as Status) ?? "want");
  const [rating, setRating] = useState(entry?.rating ?? 0);
  const [note, setNote] = useState(entry?.note ?? "");
  const [releaseDate, setReleaseDate] = useState(entry?.release_date ?? "");
  const [releaseDateSource, setReleaseDateSource] = useState<string | null>(entry?.release_date_source ?? null);

  const { data: kpPremiere } = useKpPremiere(selected?.kp_id ?? null);

  useEffect(() => {
    if (kpPremiere?.premiere_ru) {
      setReleaseDate(kpPremiere.premiere_ru);
      setReleaseDateSource("ru");
    } else if (kpPremiere?.premiere_world) {
      setReleaseDate(kpPremiere.premiere_world);
      setReleaseDateSource("world");
    }
  }, [kpPremiere]);

  const { data: suggestions, isFetching } = useLookupMedia(type, query);
  const { mutate: create, isPending: isCreating } = useCreateMedia();
  const { mutate: update, isPending: isUpdating } = useUpdateMedia();
  const isPending = isCreating || isUpdating;

  useEffect(() => {
    if (!isEdit) setSelected(null);
  }, [type, isEdit]);

  function handleSelect(s: LookupResult) {
    setSelected({ title: s.title, author: s.author, cover_url: s.cover_url, kp_id: s.kp_id });
    setQuery(s.title);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = selected?.title || query.trim();
    if (!title) return;

    const payload = {
      media_type: type,
      title,
      author: selected?.author ?? null,
      cover_url: selected?.cover_url ?? null,
      status,
      rating: rating || null,
      note: note.trim() || null,
      release_date: releaseDate || null,
      release_date_source: releaseDate ? releaseDateSource : null,
      finished_at: status === "done" ? new Date().toISOString().slice(0, 10) : null,
      kp_id: selected?.kp_id ?? null,
    };

    if (isEdit) {
      update({ id: entry.id, ...payload }, { onSuccess: onClose });
    } else {
      create(payload as Parameters<typeof create>[0], { onSuccess: onClose });
    }
  }

  const showSuggestions = !selected && query.length >= 2 && suggestions && suggestions.length > 0;

  const inputCls = "w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400";
  const inputStyle = { borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl p-5" style={{ background: "var(--t-card-bg, #ffffff)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--t-primary)" }}>
            {isEdit ? "Редактировать" : "Добавить"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08]">
            <X size={16} style={{ color: "var(--t-faint)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEdit && (
            <div className="grid grid-cols-4 gap-1.5">
              {(["book", "movie", "series", "game"] as MediaType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`py-1.5 rounded-xl text-[12px] font-medium border transition-colors ${
                    type === t ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-white/[0.12]"
                  }`}
                  style={type !== t ? { color: "var(--t-muted)" } : undefined}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          <div className="relative">
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Название *
            </label>
            <div className="relative">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
                placeholder={`Поиск ${TYPE_LABELS[type].toLowerCase()}…`}
                className={inputCls + " pr-8"}
                style={inputStyle}
                required={!selected}
              />
              {isFetching && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              )}
              {!isFetching && <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--t-faint)" }} />}
            </div>

            {showSuggestions && (
              <div
                className="absolute top-full mt-1 left-0 right-0 z-10 rounded-xl border shadow-lg overflow-hidden"
                style={{ background: "var(--t-card-bg, #fff)", borderColor: "var(--app-border)" }}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelect(s)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    {s.cover_url ? (
                      <img src={s.cover_url} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-10 rounded flex-shrink-0 bg-slate-100 dark:bg-white/[0.08]" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-primary)" }}>{s.title}</p>
                      {s.author && <p className="text-[11px] truncate" style={{ color: "var(--t-faint)" }}>{s.author}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected?.cover_url && (
            <div className="flex items-center gap-3">
              <img src={selected.cover_url} alt="" className="w-12 h-16 object-cover rounded-lg flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--t-primary)" }}>{selected.title}</p>
                {selected.author && <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>{selected.author}</p>}
              </div>
              <button type="button" onClick={() => { setSelected(null); setQuery(""); }} className="ml-auto shrink-0">
                <X size={13} style={{ color: "var(--t-faint)" }} />
              </button>
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Статус</label>
            <div className="flex gap-1.5">
              {(["want", "in_progress", "done"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-1.5 rounded-xl text-[12px] font-medium border transition-colors ${
                    status === s ? "bg-indigo-500 border-indigo-500 text-white" : "border-slate-200 dark:border-white/[0.12]"
                  }`}
                  style={status !== s ? { color: "var(--t-muted)" } : undefined}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {(type === "movie" || type === "series") && (
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
                Дата выхода
                {releaseDate && releaseDateSource === "ru" && (
                  <span className="ml-1.5 text-indigo-400">РФ · с Кинопоиска</span>
                )}
                {releaseDate && releaseDateSource === "world" && (
                  <span className="ml-1.5 text-amber-400">мировой прокат · даты в РФ пока нет</span>
                )}
              </label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--t-muted)" }}>Оценка</label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>Заметка</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Впечатления, цитата…"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400 resize-none"
              style={inputStyle}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border text-[14px] font-medium"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "var(--t-muted)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || (!selected && !query.trim())}
              className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[14px] font-medium disabled:opacity-50"
            >
              {isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
