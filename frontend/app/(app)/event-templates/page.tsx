"use client";

import { useState, useMemo } from "react";
import { CalendarDays, Pencil, Archive, RotateCcw, ChevronDown } from "lucide-react";
import { Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";
import { CreateEventModal } from "@/components/modals/CreateEventModal";
import { EventTemplatePanel } from "@/components/events/EventTemplatePanel";
import type { CompletionMode } from "@/types/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventTemplate {
  event_id: number;
  title: string;
  description: string | null;
  category_id: number | null;
  category_emoji: string | null;
  category_title: string | null;
  freq: string | null;
  by_weekday: string | null;
  freq_label: string;
  is_archived: boolean;
  next_date: string | null;
  created_at: string;
  completion_mode: CompletionMode;
  default_start_time: string | null;
  default_end_time: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${RU_MONTHS[parseInt(m) - 1]}`;
}

function isPastOneTime(ev: EventTemplate): boolean {
  return !ev.freq && !ev.next_date && !ev.is_archived;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { value: false, label: "Активные" },
  { value: true,  label: "Архивные" },
] as const;

type TabArchived = (typeof TABS)[number]["value"];

// ── Hook ──────────────────────────────────────────────────────────────────────

function useEventTemplates() {
  return useQuery<EventTemplate[]>({
    queryKey: ["event-templates"],
    queryFn: () => api.get<EventTemplate[]>("/api/v2/event-templates"),
    staleTime: 30 * 1000,
  });
}

// ── Row ───────────────────────────────────────────────────────────────────────

function TemplateRow({
  item,
  index,
  total,
  selected,
  onSelect,
  onArchive,
  onRestore,
  faded,
}: {
  item: EventTemplate;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onRestore: () => void;
  faded?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer ${
        index < total - 1 ? "border-b border-white/[0.05]" : ""
      } ${selected ? "bg-white/[0.04]" : ""} ${faded ? "opacity-60" : ""}`}
      onClick={onSelect}
    >
      <span className="text-base shrink-0">{item.category_emoji ?? "📅"}</span>

      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-medium truncate"
          style={{ color: item.is_archived || faded ? "var(--t-faint)" : "var(--t-primary)" }}
        >
          {item.title}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
          {item.category_title ?? "Без категории"}
          {" · "}
          {item.freq_label}
          {item.default_end_time && <> · до {item.default_end_time}</>}
          {item.next_date && <> · Следующий: {formatDate(item.next_date)}</>}
          {!item.next_date && item.freq && <> · Нет запланированных</>}
          {faded && <> · прошло</>}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Tooltip content="Редактировать шаблон">
          <button
            onClick={onSelect}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
          >
            <Pencil size={13} className="text-white/40" />
          </button>
        </Tooltip>
        {item.is_archived ? (
          <Tooltip content="Восстановить">
            <button
              onClick={onRestore}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <RotateCcw size={13} className="text-indigo-400/60" />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content="В архив">
            <button
              onClick={onArchive}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <Archive size={13} className="text-white/30" />
            </button>
          </Tooltip>
        )}
      </div>

      <Badge
        variant={item.is_archived ? "neutral" : item.freq ? "accent" : "neutral"}
        size="sm"
        className="shrink-0"
      >
        {item.is_archived ? "Архив" : item.freq ? item.freq_label : "Однократно"}
      </Badge>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventTemplatesPage() {
  const [archived, setArchived] = useState<TabArchived>(false);
  const [catFilter, setCatFilter] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);
  const { data: all, isLoading, isError } = useEventTemplates();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EventTemplate | null>(null);

  async function handleArchive(id: number) {
    await api.post(`/api/v2/events/${id}/archive`);
    qc.invalidateQueries({ queryKey: ["event-templates"] });
    if (selectedTemplate?.event_id === id) setSelectedTemplate(null);
  }
  async function handleRestore(id: number) {
    await api.post(`/api/v2/events/${id}/restore`);
    qc.invalidateQueries({ queryKey: ["event-templates"] });
  }
  async function handleArchiveAllPast() {
    const past = (all ?? []).filter(isPastOneTime);
    await Promise.all(past.map((ev) => api.post(`/api/v2/events/${ev.event_id}/archive`)));
    qc.invalidateQueries({ queryKey: ["event-templates"] });
    setShowPast(false);
  }

  // Unique categories for filter chips
  const categories = useMemo(() => {
    const map = new Map<number, { id: number; emoji: string | null; title: string | null }>();
    for (const ev of all ?? []) {
      if (ev.category_id && !map.has(ev.category_id)) {
        map.set(ev.category_id, { id: ev.category_id, emoji: ev.category_emoji, title: ev.category_title });
      }
    }
    return [...map.values()].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  }, [all]);

  // Base list for current tab
  const tabItems = (all ?? []).filter((ev) => ev.is_archived === archived);

  // For active tab: separate past one-time from the main list
  const mainItems = archived
    ? tabItems
    : tabItems.filter((ev) => !isPastOneTime(ev));
  const pastItems = archived ? [] : tabItems.filter(isPastOneTime);

  // Apply category filter
  const applyCat = (list: EventTemplate[]) =>
    catFilter === null ? list : list.filter((ev) => ev.category_id === catFilter);

  const filteredMain = applyCat(mainItems);
  const filteredPast = applyCat(pastItems);

  // Keep selected template in sync with latest data from query
  const liveSelected = selectedTemplate
    ? (all ?? []).find((t) => t.event_id === selectedTemplate.event_id) ?? selectedTemplate
    : null;

  const totalShown = filteredMain.length + (showPast ? filteredPast.length : 0);

  return (
    <>
      {showCreate && <CreateEventModal onClose={() => setShowCreate(false)} />}
      {liveSelected && (
        <EventTemplatePanel
          template={liveSelected}
          onClose={() => setSelectedTemplate(null)}
        />
      )}
      <PageHeader
        title="Шаблоны событий"
        density="compact"
        actions={
          <Button variant="primary" size="sm" leftIcon={<Plus size={13} />} onClick={() => setShowCreate(true)}>
            Создать событие
          </Button>
        }
      />

      <main className="flex-1 p-3 md:p-6 w-full">
        {/* Tabs + count */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.06] rounded-lg md:rounded-xl p-0.5 md:p-1">
            {TABS.map(({ value, label }) => (
              <button
                key={String(value)}
                onClick={() => setArchived(value)}
                className={`px-2.5 md:px-3 py-1 md:py-1.5 rounded-md md:rounded-lg text-[11px] md:text-xs font-medium transition-colors ${
                  archived === value
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {totalShown > 0 && (
            <span
              className="text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06]"
              style={{ color: "var(--t-faint)" }}
            >
              {totalShown}
            </span>
          )}
        </div>

        {/* Category filter chips */}
        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <button
              onClick={() => setCatFilter(null)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors"
              style={{
                background: catFilter === null ? "var(--app-accent)" : "transparent",
                color: catFilter === null ? "#fff" : "var(--t-faint)",
                borderColor: catFilter === null ? "var(--app-accent)" : "var(--app-border)",
              }}
            >
              Все
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors"
                style={{
                  background: catFilter === cat.id ? "var(--app-accent)" : "transparent",
                  color: catFilter === cat.id ? "#fff" : "var(--t-faint)",
                  borderColor: catFilter === cat.id ? "var(--app-accent)" : "var(--app-border)",
                }}
              >
                {cat.emoji && <span>{cat.emoji}</span>}
                {cat.title}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={56} className="rounded-xl" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить события
          </p>
        )}

        {/* List */}
        {!isLoading && !isError && (
          <div className="space-y-4">
            {/* Main list */}
            <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-xl md:rounded-2xl overflow-hidden">
              {filteredMain.length === 0 && filteredPast.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center px-4">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2.5 md:mb-3">
                    <CalendarDays size={18} className="text-white/30" />
                  </div>
                  <p className="text-[13px] md:text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                    {catFilter !== null ? "Нет событий в этой категории" : archived ? "Нет архивных событий" : "Нет активных событий"}
                  </p>
                </div>
              )}

              {filteredMain.map((item, i) => (
                <TemplateRow
                  key={item.event_id}
                  item={item}
                  index={i}
                  total={filteredMain.length}
                  selected={selectedTemplate?.event_id === item.event_id}
                  onSelect={() => setSelectedTemplate(item)}
                  onArchive={() => handleArchive(item.event_id)}
                  onRestore={() => handleRestore(item.event_id)}
                />
              ))}
            </div>

            {/* Past one-time section */}
            {!archived && filteredPast.length > 0 && (
              <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-xl md:rounded-2xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setShowPast((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${showPast ? "" : "-rotate-90"}`}
                      style={{ color: "var(--t-faint)" }}
                    />
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                      Прошедшие однократные
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--app-border)", color: "var(--t-faint)" }}
                    >
                      {filteredPast.length}
                    </span>
                  </div>
                  {showPast && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleArchiveAllPast(); }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors hover:bg-white/[0.04]"
                      style={{ color: "var(--t-faint)", borderColor: "var(--app-border)" }}
                    >
                      Архивировать все
                    </button>
                  )}
                </div>

                {showPast && filteredPast.map((item, i) => (
                  <TemplateRow
                    key={item.event_id}
                    item={item}
                    index={i}
                    total={filteredPast.length}
                    selected={selectedTemplate?.event_id === item.event_id}
                    onSelect={() => setSelectedTemplate(item)}
                    onArchive={() => handleArchive(item.event_id)}
                    onRestore={() => handleRestore(item.event_id)}
                    faded
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
