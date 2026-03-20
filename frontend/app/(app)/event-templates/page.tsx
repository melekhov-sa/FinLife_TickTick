"use client";

import { useState } from "react";
import { CalendarDays, Pencil, Archive, RotateCcw, X, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface EventTemplate {
  event_id: number;
  title: string;
  description: string | null;
  category_id: number | null;
  category_emoji: string | null;
  category_title: string | null;
  freq: string | null;
  freq_label: string;
  is_archived: boolean;
  next_date: string | null;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const RU_MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${RU_MONTHS[parseInt(m) - 1]}`;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EventTemplatesPage() {
  const [archived, setArchived] = useState<TabArchived>(false);
  const { data: all, isLoading, isError } = useEventTemplates();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  async function handleArchive(id: number) {
    await api.post(`/api/v2/events/${id}/archive`);
    qc.invalidateQueries({ queryKey: ["event-templates"] });
  }
  async function handleRestore(id: number) {
    await api.post(`/api/v2/events/${id}/restore`);
    qc.invalidateQueries({ queryKey: ["event-templates"] });
  }
  async function handleSaveTitle(id: number) {
    if (!editTitle.trim()) return;
    await api.patch(`/api/v2/events/${id}`, { title: editTitle.trim() });
    qc.invalidateQueries({ queryKey: ["event-templates"] });
    setEditingId(null);
  }

  const templates = (all ?? []).filter((ev) => ev.is_archived === archived);

  return (
    <>
      <AppTopbar title="Шаблоны событий" />

      <main className="flex-1 overflow-auto p-3 md:p-6 max-w-2xl">
        {/* Tabs + count */}
        <div className="flex items-center justify-between mb-3 md:mb-5">
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

          {templates.length > 0 && (
            <span
              className="text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06]"
              style={{ color: "var(--t-faint)" }}
            >
              {templates.length}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-14 bg-white/[0.02] rounded-xl animate-pulse" />
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
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl md:rounded-2xl overflow-hidden">
            {/* Empty state */}
            {templates.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 md:py-16 text-center px-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-2.5 md:mb-3">
                  <CalendarDays size={18} className="text-white/30" />
                </div>
                <p className="text-[13px] md:text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  {archived ? "Нет архивных событий" : "Нет активных событий"}
                </p>
                {!archived && (
                  <a
                    href="/events"
                    className="mt-2 text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
                  >
                    Перейти к событиям
                  </a>
                )}
              </div>
            )}

            {/* Rows */}
            {templates.map((item, i) => (
              <div
                key={item.event_id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors ${
                  i < templates.length - 1 ? "border-b border-white/[0.05]" : ""
                }`}
              >
                <span className="text-base shrink-0">
                  {item.category_emoji ?? "📅"}
                </span>

                <div className="flex-1 min-w-0">
                  {editingId === item.event_id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveTitle(item.event_id); if (e.key === "Escape") setEditingId(null); }}
                        className="flex-1 px-2 py-1 text-[14px] rounded-lg bg-white/[0.05] border border-indigo-500/40 outline-none"
                        style={{ color: "var(--t-primary)" }}
                      />
                      <button onClick={() => handleSaveTitle(item.event_id)} className="p-1 rounded-lg hover:bg-white/[0.06]"><Check size={14} className="text-emerald-400" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1 rounded-lg hover:bg-white/[0.06]"><X size={14} className="text-white/40" /></button>
                    </div>
                  ) : (
                    <>
                      <p
                        className="text-[14px] font-medium truncate"
                        style={{ color: item.is_archived ? "var(--t-faint)" : "var(--t-primary)" }}
                      >
                        {item.title}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                        {item.category_title ?? "Без категории"}
                        {" · "}
                        {item.freq_label}
                        {item.next_date && (
                          <> · Следующий: {formatDate(item.next_date)}</>
                        )}
                        {!item.next_date && item.freq && (
                          <> · Нет запланированных</>
                        )}
                      </p>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!item.is_archived && editingId !== item.event_id && (
                    <button
                      onClick={() => { setEditingId(item.event_id); setEditTitle(item.title); }}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                      title="Редактировать"
                    >
                      <Pencil size={13} className="text-white/40" />
                    </button>
                  )}
                  {item.is_archived ? (
                    <button
                      onClick={() => handleRestore(item.event_id)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                      title="Восстановить"
                    >
                      <RotateCcw size={13} className="text-indigo-400/60" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchive(item.event_id)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                      title="В архив"
                    >
                      <Archive size={13} className="text-white/30" />
                    </button>
                  )}
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    item.is_archived
                      ? "bg-white/[0.05] text-white/40"
                      : item.freq
                        ? "bg-indigo-500/15 text-indigo-400"
                        : "bg-emerald-500/15 text-emerald-400"
                  }`}
                >
                  {item.is_archived ? "Архив" : item.freq ? item.freq_label : "Однократно"}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Link to events page for creating */}
        {!isLoading && !isError && templates.length > 0 && !archived && (
          <div className="mt-4 text-center">
            <a
              href="/events"
              className="text-[11px] font-medium text-indigo-400/50 hover:text-indigo-400/80 transition-colors"
            >
              Управление в разделе События
            </a>
          </div>
        )}
      </main>
    </>
  );
}
