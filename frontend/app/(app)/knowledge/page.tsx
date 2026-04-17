"use client";

import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useKnowledge } from "@/hooks/useKnowledge";
import { Select } from "@/components/ui/Select";
import type { ArticleListItem } from "@/types/api";

const TYPE_OPTIONS = [
  { value: "", label: "Все типы" },
  { value: "note",        label: "Заметки" },
  { value: "instruction", label: "Инструкции" },
  { value: "checklist",   label: "Чеклисты" },
  { value: "template",    label: "Шаблоны" },
  { value: "reference",   label: "Справки" },
];

const STATUS_COLORS: Record<string, string> = {
  draft:     "text-white/72 bg-white/[0.05] border border-white/[0.08]",
  published: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  archived:  "text-white/55 bg-white/[0.03] border border-white/[0.05]",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return `${days}д назад`;
  if (days < 30) return `${Math.floor(days / 7)}нед назад`;
  if (days < 365) return `${Math.floor(days / 30)}мес назад`;
  return `${Math.floor(days / 365)}г назад`;
}

function ArticleRow({ article }: { article: ArticleListItem }) {
  const statusCls = STATUS_COLORS[article.status] ?? "text-white/68";
  return (
    <a
      href={`/knowledge/${article.id}`}
      className="flex items-start gap-3.5 py-3.5 px-4 hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04] last:border-0"
    >
      <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.06] flex items-center justify-center text-base shrink-0 mt-0.5">
        {article.type_emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {article.pinned && <span className="text-xs text-amber-400">📌</span>}
          <span className="text-sm font-medium text-white/85 group-hover:text-white transition-colors truncate" style={{ letterSpacing: "-0.01em" }}>
            {article.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusCls}`}>
            {article.status_label}
          </span>
          <span className="text-[10px] font-semibold text-white/55 uppercase tracking-widest">{article.type_label}</span>
          {article.tags.map((t) => (
            <span key={t.id} className="text-[10px] font-medium text-indigo-400/80 bg-indigo-500/10 border border-indigo-500/15 px-1.5 py-0.5 rounded-full">
              #{t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="text-[11px] font-medium text-white/55 shrink-0 mt-1">{timeAgo(article.updated_at)}</div>
    </a>
  );
}

type Timer = ReturnType<typeof setTimeout>;

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, isError } = useKnowledge({
    search: debouncedSearch || undefined,
    type: typeFilter || undefined,
  });

  function handleSearch(val: string) {
    setSearch(val);
    clearTimeout((window as unknown as { _kbTimer?: Timer })._kbTimer);
    (window as unknown as { _kbTimer?: Timer })._kbTimer = setTimeout(() => setDebouncedSearch(val), 300);
  }

  const pinned = data?.filter((a) => a.pinned) ?? [];
  const rest = data?.filter((a) => !a.pinned) ?? [];

  return (
    <>
      <AppTopbar title="База знаний" />
      <main className="flex-1 overflow-auto p-6 max-w-2xl mx-auto w-full">
        {/* Controls */}
        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Поиск по названию или тексту…"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/80 placeholder-white/30 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>
          <div className="w-40">
            <Select value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
          </div>
          <a
            href="/legacy/knowledge/create"
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl px-4 py-2 transition-colors whitespace-nowrap"
          >
            + Статья
          </a>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <div className="text-white/68 text-sm text-center mt-12">Не удалось загрузить статьи</div>
        )}
        {data && data.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-white/50" />
            </div>
            <p className="text-sm font-medium text-white/65">
              {debouncedSearch || typeFilter ? "Ничего не найдено" : "База знаний пуста"}
            </p>
            {!debouncedSearch && !typeFilter && (
              <a
                href="/legacy/knowledge/create"
                className="mt-4 text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                Создать первую статью →
              </a>
            )}
          </div>
        )}
        {data && data.length > 0 && (
          <div className="space-y-5">
            {pinned.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3 px-1">
                  Закреплённые
                </p>
                <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl overflow-hidden">
                  {pinned.map((a) => <ArticleRow key={a.id} article={a} />)}
                </div>
              </div>
            )}
            {rest.length > 0 && (
              <div>
                {pinned.length > 0 && (
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3 px-1">
                    Остальные
                  </p>
                )}
                <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl overflow-hidden">
                  {rest.map((a) => <ArticleRow key={a.id} article={a} />)}
                </div>
              </div>
            )}
            <div className="text-[10px] font-semibold text-white/55 uppercase tracking-widest text-center pt-1">
              {data.length} {data.length === 1 ? "статья" : data.length < 5 ? "статьи" : "статей"}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
