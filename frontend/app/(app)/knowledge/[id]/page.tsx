"use client";

import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ArrowLeft, Pencil, Pin, Calendar } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";

interface ArticleDetail {
  id: number;
  title: string;
  content_md: string;
  type: string;
  type_label: string;
  type_emoji: string;
  status: string;
  status_label: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  tags: { id: number; name: string }[];
  linked_projects: { id: number; title: string; status: string }[];
}

const STATUS_VARIANTS: Record<string, "success" | "warning" | "neutral"> = {
  published: "success",
  draft:     "warning",
  archived:  "neutral",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-white/70 mt-5 mb-1.5 tracking-tight">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-white/82 mt-6 mb-2 tracking-tight">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-white/90 mt-6 mb-2.5 tracking-tight">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white/85">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-white/70 italic">$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-indigo-500/[0.12] border border-indigo-500/20 px-1.5 py-0.5 rounded-md text-indigo-300/90 text-[0.82em] font-mono">$1</code>')
    .replace(/^- (.+)$/gm, '<li class="ml-5 text-white/62 list-disc marker:text-white/50 mb-0.5">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-5 text-white/62 list-decimal marker:text-white/60 mb-0.5">$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 decoration-indigo-500/30 transition-colors" target="_blank">$1</a>')
    .replace(/\n\n/g, '</p><p class="text-white/60 text-sm leading-relaxed mb-3 mt-0">')
    .replace(/\n/g, "<br />");
}

export default function KnowledgeArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, isError } = useQuery<ArticleDetail>({
    queryKey: ["knowledge-article", id],
    queryFn: () => api.get<ArticleDetail>(`/api/v2/knowledge/${id}`),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <>
      <AppTopbar title={data?.title ?? "Статья"} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[720px]">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton variant="rect" height={24} width="25%" className="rounded-lg" />
              <Skeleton variant="rect" height={36} width="66%" className="rounded-xl" />
              <Skeleton variant="rect" height={16} width="33%" className="rounded-lg" />
              <Skeleton variant="rect" height={256} className="rounded-2xl mt-6" />
            </div>
          )}

          {isError && (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">📄</p>
              <p className="text-white/65 text-sm mb-5">Статья не найдена</p>
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 text-xs text-indigo-400/70 hover:text-indigo-400 transition-colors"
              >
                <ArrowLeft size={12} /> К списку статей
              </Link>
            </div>
          )}

          {data && (
            <div className="space-y-5">
              {/* Back link */}
              <Link
                href="/knowledge"
                className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white/55 transition-colors"
              >
                <ArrowLeft size={12} /> Все статьи
              </Link>

              {/* Header card */}
              <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className="text-base">{data.type_emoji}</span>
                  <span className="text-[10px] font-semibold text-white/65 uppercase tracking-widest">
                    {data.type_label}
                  </span>
                  <span className="text-white/15">·</span>
                  <Badge variant={STATUS_VARIANTS[data.status] ?? "neutral"} size="sm">
                    {data.status_label}
                  </Badge>
                  {data.pinned && (
                    <Badge variant="warning" size="sm" leftIcon={<Pin size={9} />}>
                      Закреплена
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-xl font-bold text-white/92 mb-1" style={{ letterSpacing: "-0.02em" }}>
                  {data.title}
                </h1>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                  <Calendar size={11} />
                  <span>Обновлено {formatDate(data.updated_at)}</span>
                </div>

                {/* Tags */}
                {data.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/[0.05]">
                    {data.tags.map((t) => (
                      <span
                        key={t.id}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/[0.08] border border-indigo-500/20 text-indigo-400/70"
                      >
                        #{t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit button */}
              <div>
                <a
                  href={`/legacy/knowledge/${data.id}/edit`}
                  className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/68 hover:text-white/70 hover:border-white/[0.12] transition-all"
                >
                  <Pencil size={11} /> Редактировать
                </a>
              </div>

              {/* Content */}
              <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-6">
                {data.content_md ? (
                  <div
                    className="text-sm text-white/60 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: `<p class="text-white/60 text-sm leading-relaxed mb-3 mt-0">${renderMarkdown(data.content_md)}</p>`,
                    }}
                  />
                ) : (
                  <p className="text-white/50 text-sm italic text-center py-8">Содержимое отсутствует</p>
                )}
              </div>

              {/* Linked projects */}
              {data.linked_projects.length > 0 && (
                <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-5">
                  <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3">
                    Связанные проекты
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.linked_projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="text-xs px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-white/72 hover:text-white/75 hover:border-white/[0.12] transition-all"
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
