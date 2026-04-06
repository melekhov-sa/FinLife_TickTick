"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useMe } from "@/hooks/useMe";
import { clsx } from "clsx";
import { Plus, ShoppingBag, ListTodo, Map, Globe, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

interface SharedListSummary {
  id: number;
  title: string;
  description: string | null;
  list_type: string;
  slug: string;
  is_public: boolean;
  item_count: number;
  created_at: string;
  updated_at: string;
}

const TYPE_META: Record<string, { icon: typeof ShoppingBag; label: string; color: string }> = {
  wishlist:  { icon: ShoppingBag, label: "Вишлист",  color: "text-indigo-500" },
  personal:  { icon: ListTodo,    label: "Личное",   color: "text-slate-500" },
  roadmap:   { icon: Map,         label: "Роадмап",  color: "text-emerald-500" },
};

export default function ListsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.is_admin ?? false;

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<string>("wishlist");
  const [newDesc, setNewDesc] = useState("");

  const { data: lists, isLoading } = useQuery<SharedListSummary[]>({
    queryKey: ["shared-lists"],
    queryFn: () => api.get<SharedListSummary[]>("/api/v2/lists"),
    staleTime: 30_000,
  });

  const { mutate: createList, isPending } = useMutation({
    mutationFn: (body: { title: string; list_type: string; description: string | null }) =>
      api.post("/api/v2/lists", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-lists"] });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
    },
  });

  const { mutate: deleteList } = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-lists"] }),
  });

  function handleCreate() {
    if (!newTitle.trim()) return;
    createList({ title: newTitle.trim(), list_type: newType, description: newDesc.trim() || null });
  }

  const availableTypes = isAdmin
    ? ["wishlist", "personal", "roadmap"] as const
    : ["wishlist", "personal"] as const;

  return (
    <>
      {showCreate && (
        <BottomSheet
          open
          onClose={() => setShowCreate(false)}
          title="Новый список"
          footer={
            <button
              onClick={handleCreate}
              disabled={isPending || !newTitle.trim()}
              className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {isPending ? "Создаём..." : "Создать"}
            </button>
          }
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              {availableTypes.map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType(t)}
                    className={clsx(
                      "flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border transition-all text-[12px] font-medium",
                      newType === t
                        ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                        : "border-slate-200 dark:border-white/[0.08] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                    )}
                    style={{ color: newType === t ? undefined : "var(--t-secondary)" }}
                  >
                    <Icon size={20} className={newType === t ? meta.color : ""} />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500">Название</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={newType === "wishlist" ? "Мои хотелки" : newType === "roadmap" ? "Roadmap 2026" : "Фильмы к просмотру"}
                className="w-full px-3 h-10 text-[15px] rounded-xl border focus:outline-none focus:border-indigo-500/60 bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500">Описание (необязательно)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Краткое описание"
                className="w-full px-3 h-10 text-[15px] rounded-xl border focus:outline-none focus:border-indigo-500/60 bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85"
              />
            </div>
          </div>
        </BottomSheet>
      )}

      <AppTopbar title="Списки" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="max-w-[700px]">

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Вишлисты, списки, роадмапы
            </h2>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-sm"
            >
              <Plus size={14} />
              <span className="hidden md:inline">Новый список</span>
            </button>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-100 dark:bg-white/[0.02] rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {lists && lists.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <ShoppingBag size={24} className="text-indigo-400/40" />
              </div>
              <p className="text-[14px] font-medium" style={{ color: "var(--t-muted)" }}>Пока нет списков</p>
              <button onClick={() => setShowCreate(true)} className="mt-3 text-[13px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
                + Создать первый список
              </button>
            </div>
          )}

          {lists && lists.length > 0 && (
            <div className="space-y-2">
              {lists.map((lst) => {
                const meta = TYPE_META[lst.list_type] ?? TYPE_META.wishlist;
                const Icon = meta.icon;
                return (
                  <Link
                    key={lst.id}
                    href={`/lists/${lst.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors group"
                  >
                    <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-50 dark:bg-white/[0.04]", meta.color)}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium truncate" style={{ color: "var(--t-primary)" }}>{lst.title}</p>
                      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                        {meta.label} · {lst.item_count} элементов
                        {lst.is_public ? <> · <Globe size={10} className="inline -mt-px" /> публичный</> : <> · <Lock size={10} className="inline -mt-px" /> приватный</>}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteList(lst.id); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                      style={{ color: "var(--t-faint)" }}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
