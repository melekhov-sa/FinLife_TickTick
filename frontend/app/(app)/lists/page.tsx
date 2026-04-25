"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useMe } from "@/hooks/useMe";
import { clsx } from "clsx";
import { Plus, ShoppingBag, ListTodo, Map, Globe, Lock, Trash2, Plane } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";

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
  trip:      { icon: Plane,       label: "Поездка",  color: "text-sky-500" },
};

export default function ListsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = me?.is_admin ?? false;

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<string>("wishlist");
  const [newDesc, setNewDesc] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");

  const { data: lists, isLoading } = useQuery<SharedListSummary[]>({
    queryKey: ["shared-lists"],
    queryFn: () => api.get<SharedListSummary[]>("/api/v2/lists"),
    staleTime: 30_000,
  });

  const { mutate: createList, isPending } = useMutation({
    mutationFn: (body: {
      title: string;
      list_type: string;
      description: string | null;
      budget_amount?: string | null;
      period_from?: string | null;
      period_to?: string | null;
    }) => api.post("/api/v2/lists", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-lists"] });
      qc.invalidateQueries({ queryKey: ["shared-lists", "trip"] });
      setShowCreate(false);
      setNewTitle("");
      setNewDesc("");
      setNewBudget("");
      setNewFrom("");
      setNewTo("");
    },
  });

  const { mutate: deleteList } = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-lists"] }),
  });

  function handleCreate() {
    if (!newTitle.trim()) return;
    const body: {
      title: string;
      list_type: string;
      description: string | null;
      budget_amount?: string | null;
      period_from?: string | null;
      period_to?: string | null;
    } = {
      title: newTitle.trim(),
      list_type: newType,
      description: newDesc.trim() || null,
    };
    if (newType === "trip") {
      body.budget_amount = newBudget.trim() || null;
      body.period_from = newFrom || null;
      body.period_to = newTo || null;
    }
    createList(body);
  }

  const availableTypes = isAdmin
    ? ["wishlist", "personal", "roadmap", "trip"] as const
    : ["wishlist", "personal", "trip"] as const;

  return (
    <>
      {showCreate && (
        <BottomSheet
          open
          onClose={() => setShowCreate(false)}
          title="Новый список"
          footer={
            <Button
              variant="primary"
              size="md"
              loading={isPending}
              disabled={!newTitle.trim()}
              onClick={handleCreate}
              fullWidth
            >
              Создать
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {availableTypes.map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType(t)}
                    className={clsx(
                      "flex flex-col items-center gap-1 py-3 rounded-xl border transition-all text-[12px] font-medium",
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

            <Input
              label="Название"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={
                newType === "wishlist" ? "Мои хотелки" :
                newType === "roadmap"  ? "Roadmap 2026" :
                newType === "trip"     ? "Турция, июль" :
                "Фильмы к просмотру"
              }
              autoFocus
            />

            <Input
              label="Описание (необязательно)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Краткое описание"
            />

            {newType === "trip" && (
              <>
                <Input
                  label="Бюджет, ₽"
                  type="number"
                  inputMode="decimal"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  placeholder="120000"
                  tabular
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">С</label>
                    <DateInput value={newFrom} onChange={setNewFrom} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">По</label>
                    <DateInput value={newTo} onChange={setNewTo} />
                  </div>
                </div>
              </>
            )}
          </div>
        </BottomSheet>
      )}

      <AppTopbar title="Списки" />
      <main className="flex-1 overflow-auto p-3 md:p-6">
        <div className="w-full">

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Вишлисты, списки, роадмапы
            </h2>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              <span className="hidden md:inline">Новый список</span>
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={80} className="rounded-xl" />
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
                    <Tooltip content="Удалить">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteList(lst.id); }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                        style={{ color: "var(--t-faint)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
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
