"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Calendar, Tag, Clock, AlignLeft, Trash2, Copy } from "lucide-react";
import { clsx } from "clsx";
import type { EventItem, WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { useUpdateEvent, useDeleteEvent, useDuplicateEvent } from "@/hooks/useEvents";
import { EventReminders } from "./EventReminders";
import { TimeInput } from "@/components/primitives/TimeInput";
import { Tooltip } from "@/components/primitives/Tooltip";

interface Props {
  event: EventItem;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RU_MONTHS_LONG = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${RU_MONTHS_LONG[d.getMonth()]}`;
}

function formatDateRange(start: string, end: string | null): string {
  if (!end || end === start) return formatDisplayDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end   + "T00:00:00");
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${RU_MONTHS_LONG[s.getMonth()]}`;
  }
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

// Deterministic color from category_id
const CAT_PALETTES = [
  { icon: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30" },
  { icon: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { icon: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  { icon: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30" },
  { icon: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30" },
  { icon: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" },
];
function catPalette(id: number | null) {
  return CAT_PALETTES[(id ?? 0) % CAT_PALETTES.length];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EventDetailPanel({ event, onClose }: Props) {
  const [title, setTitle]         = useState(event.title);
  const [desc, setDesc]           = useState(event.description ?? "");
  const [startDate, setStartDate] = useState(event.start_date);
  const [endDate, setEndDate]     = useState(event.end_date ?? "");
  const [startTime, setStartTime] = useState(event.start_time ?? "");
  const [catId, setCatId]         = useState<string>(event.category_id ? String(event.category_id) : "");
  const [titleFocused, setTitleFocused] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef    = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const palette     = catPalette(event.category_id);

  const { mutate: update }    = useUpdateEvent();
  const { mutate: del }       = useDeleteEvent();
  const { mutate: duplicate } = useDuplicateEvent();

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const catOptions = [
    { value: "", label: "— без категории —" },
    ...(categories ?? []).map((c) => ({
      value: String(c.category_id),
      label: c.title,
      emoji: c.emoji ?? undefined,
    })),
  ];

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Sync state when event prop changes
  useEffect(() => {
    setTitle(event.title);
    setDesc(event.description ?? "");
    setStartDate(event.start_date);
    setEndDate(event.end_date ?? "");
    setStartTime(event.start_time ?? "");
    setCatId(event.category_id ? String(event.category_id) : "");
  }, [event.occurrence_id]);

  const debounceSave = useCallback((field: "description", value: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      update({ occurrenceId: event.occurrence_id, data: { [field]: value || null } });
    }, 800);
  }, [event.occurrence_id, update]);

  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed && trimmed !== event.title) {
      update({ occurrenceId: event.occurrence_id, data: { title: trimmed } });
    } else {
      setTitle(event.title);
    }
  }

  function saveField(field: string, value: string | null) {
    update({ occurrenceId: event.occurrence_id, data: { [field]: value || null } });
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    del(event.occurrence_id);
    onClose();
  }

  const dateLabel = formatDateRange(startDate, endDate || null);

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />

      {/* Panel */}
      <div
        className={clsx(
          "fixed z-40 bg-[#161d2b] border-l border-white/[0.07] shadow-2xl flex flex-col",
          "inset-x-0 bottom-0 top-[20%] rounded-t-2xl",
          "lg:inset-x-auto lg:top-0 lg:bottom-0 lg:right-0 lg:w-[400px] lg:rounded-none",
        )}
        style={{ animation: "slideInPanel 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Category color dot */}
            <div className={clsx("w-2 h-2 rounded-full", palette.bg.replace("bg-", "bg-").replace("/10", "/70"))} />
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              {event.category_title ?? "Событие"}
            </span>
            {event.category_emoji && <span className="text-base">{event.category_emoji}</span>}
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content="Дублировать">
              <button
                onClick={() => { duplicate(event.occurrence_id); onClose(); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
                style={{ color: "var(--t-faint)" }}
              >
                <Copy size={13} />
              </button>
            </Tooltip>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Title */}
          <div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => { setTitleFocused(false); saveTitle(); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); }
                if (e.key === "Escape") { setTitle(event.title); titleRef.current?.blur(); }
              }}
              className={clsx(
                "w-full text-[18px] font-semibold bg-transparent outline-none leading-snug",
                "border-b transition-colors pb-1",
                titleFocused ? "border-indigo-500/50" : "border-transparent hover:border-white/[0.08]"
              )}
              style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}
            />
          </div>

          {/* Date range */}
          <div className="flex items-start gap-3">
            <Calendar size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Дата
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); saveField("start_date", e.target.value); }}
                  className="px-2.5 py-1.5 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark]"
                  style={{ color: "var(--t-secondary)" }}
                />
                <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>–</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); saveField("end_date", e.target.value); }}
                  className="px-2.5 py-1.5 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark]"
                  style={{ color: "var(--t-secondary)" }}
                />
              </div>
              <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--t-muted)" }}>{dateLabel}</p>
            </div>
          </div>

          {/* Time */}
          <div className="flex items-start gap-3">
            <Clock size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Время
              </p>
              <div className="flex items-center gap-2">
                <TimeInput
                  value={startTime}
                  onChange={(v) => { setStartTime(v); saveField("start_time", v); }}
                  size="sm"
                  className="w-[140px]"
                />
                {!startTime && (
                  <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>Весь день</span>
                )}
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="flex items-start gap-3">
            <Tag size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Категория
              </p>
              <Select
                value={catId}
                onChange={(v) => {
                  setCatId(v);
                  update({ occurrenceId: event.occurrence_id, data: { category_id: v ? Number(v) : null } });
                }}
                options={catOptions}
                placeholder="— без категории —"
              />
            </div>
          </div>

          {/* Description */}
          {/* Reminders */}
          <EventReminders
            eventId={event.event_id}
            startTime={event.start_time ?? null}
          />

          <div className="flex items-start gap-3">
            <AlignLeft size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Описание
              </p>
              <textarea
                value={desc}
                onChange={(e) => { setDesc(e.target.value); debounceSave("description", e.target.value); }}
                placeholder="Добавить описание..."
                rows={3}
                className="w-full px-3 py-2.5 text-[14px] rounded-xl bg-white/[0.04] border border-white/[0.07] focus:outline-none focus:border-indigo-500/40 transition-colors resize-none placeholder-white/25"
                style={{ color: "var(--t-secondary)" }}
              />
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 flex items-center justify-between">
          <a
            href={`/legacy/events/${event.event_id}/edit`}
            className="text-[12px] font-medium hover:text-white/90 transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            Расширенные настройки →
          </a>
          <button
            onClick={handleDelete}
            onBlur={() => setTimeout(() => setConfirmDelete(false), 300)}
            className={clsx(
              "flex items-center gap-1.5 py-2 px-3 rounded-xl border transition-all text-[12px] font-medium",
              confirmDelete
                ? "bg-red-600 border-red-500 text-white"
                : "bg-white/[0.04] border-white/[0.07] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
            )}
            style={{ color: confirmDelete ? undefined : "var(--t-secondary)" }}
            title={confirmDelete ? "Нажмите ещё раз" : "Удалить"}
          >
            <Trash2 size={13} />
            {confirmDelete ? "Удалить?" : "Удалить"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); opacity: 0.8; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 1023px) {
          @keyframes slideInPanel {
            from { transform: translateY(40px); opacity: 0.8; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}
