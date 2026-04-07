"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Check, ExternalLink, Gift, ShoppingBag, Map, ImagePlus } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ListGroup {
  id: number;
  title: string;
  sort_order: number;
  color: string | null;
}

interface ListItem {
  id: number;
  list_id: number;
  group_id: number | null;
  title: string;
  note: string | null;
  url: string | null;
  image_url: string | null;
  price: string | null;
  currency: string;
  status: string;
  reserved_by: string | null;
  sort_order: number;
}

function itemImageUrl(item: ListItem): string | null {
  if (!item.image_url) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${item.image_url}`;
}

interface SharedListPublic {
  id: number;
  title: string;
  description: string | null;
  list_type: string;
  slug: string;
  is_public: boolean;
  groups: ListGroup[];
  items: ListItem[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const TYPE_META: Record<string, { icon: typeof ShoppingBag; label: string }> = {
  wishlist:  { icon: ShoppingBag, label: "Вишлист" },
  personal:  { icon: ShoppingBag, label: "Список" },
  giftlist:  { icon: Gift, label: "Список подарков" },
  roadmap:   { icon: Map, label: "Роадмап" },
};

const ROADMAP_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  done:        { label: "Готово",    color: "text-emerald-700", bg: "bg-emerald-100" },
  in_progress: { label: "В работе",  color: "text-amber-700",   bg: "bg-amber-100" },
  open:        { label: "План",      color: "text-slate-600",   bg: "bg-slate-100" },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SharedListPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  const { data: list, isLoading, isError } = useQuery<SharedListPublic>({
    queryKey: ["shared-list-public", slug],
    queryFn: () => publicGet<SharedListPublic>(`/api/v2/share/${slug}`),
    staleTime: 30_000,
  });

  const [reservingId, setReservingId] = useState<number | null>(null);
  const [reserveName, setReserveName] = useState("");

  const { mutate: reserveItem, isPending: reserving } = useMutation({
    mutationFn: ({ itemId, name }: { itemId: number; name: string }) =>
      publicPost(`/api/v2/share/${slug}/items/${itemId}/reserve`, { reserved_by: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-list-public", slug] });
      setReservingId(null);
      setReserveName("");
    },
  });

  const isGiftlist = list?.list_type === "giftlist" || list?.list_type === "wishlist";
  const isRoadmap = list?.list_type === "roadmap";
  const meta = TYPE_META[list?.list_type ?? "wishlist"] ?? TYPE_META.wishlist;
  const Icon = meta.icon;

  // Group items
  const grouped = list ? (() => {
    const ungrouped = list.items.filter((it) => !it.group_id);
    const byGroup = list.groups.map((g) => ({
      group: g,
      items: list.items.filter((it) => it.group_id === g.id),
    }));
    const result: { group: ListGroup | null; items: ListItem[] }[] = [];
    if (ungrouped.length > 0) result.push({ group: null, items: ungrouped });
    result.push(...byGroup);
    return result;
  })() : [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 animate-pulse" />
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-[18px] font-bold text-slate-800 mb-2">Список не найден</p>
          <p className="text-[14px] text-slate-500">Возможно, он приватный или удалён</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-6 md:py-8">
        <div className="max-w-[600px] mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Icon size={24} className="text-indigo-500" />
            <span className="text-[12px] font-semibold uppercase tracking-wider text-indigo-500">{meta.label}</span>
          </div>
          <h1 className="text-[22px] md:text-[26px] font-bold text-slate-900 tracking-tight">{list.title}</h1>
          {list.description && (
            <p className="text-[14px] text-slate-500 mt-1">{list.description}</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={clsx("mx-auto px-4 py-6", isRoadmap ? "max-w-full" : "max-w-[600px]")}>
        {isRoadmap ? (
          /* Kanban view for roadmaps */
          <div className="flex gap-3 overflow-x-auto pb-4">
            {(list.groups.length > 0 ? list.groups : [{ id: 0, title: "Все", sort_order: 0, color: null }]).map((group) => {
              const colItems = group.id === 0 ? list.items : list.items.filter((it) => it.group_id === group.id);
              return (
                <div key={group.id} className="w-[260px] md:w-[280px] shrink-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <h3 className="text-[14px] font-bold text-slate-800">{group.title}</h3>
                    <span className="text-[11px] font-semibold tabular-nums bg-slate-200/60 px-1.5 py-0.5 rounded-full text-slate-500">{colItems.length}</span>
                  </div>
                  <div className="flex-1 space-y-1.5 rounded-xl bg-slate-100/60 border border-slate-200/60 p-2 min-h-[100px]">
                    {colItems.map((item) => {
                      const st = ROADMAP_STATUSES[item.status] ?? ROADMAP_STATUSES.open;
                      return (
                        <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
                          <p className="text-[13px] font-medium text-slate-800 leading-snug">{item.title}</p>
                          {item.note && <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{item.note}</p>}
                          <div className="mt-2">
                            <span className={clsx("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", st.color, st.bg)}>{st.label}</span>
                          </div>
                        </div>
                      );
                    })}
                    {colItems.length === 0 && <p className="text-[11px] text-center py-4 text-slate-400">Пусто</p>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        /* Grid card view for wishlists/personal */
        grouped.map(({ group, items }) => (
          <div key={group?.id ?? "ungrouped"} className="mb-5">
            {group && (
              <h3 className="text-[12px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                {group.title}
              </h3>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {items.map((item) => {
                const img = itemImageUrl(item);
                return (
                  <div
                    key={item.id}
                    className={clsx(
                      "rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md",
                      item.status === "done" && "opacity-50",
                      item.status === "reserved" && "ring-2 ring-pink-200"
                    )}
                  >
                    {/* Cover image */}
                    <div className="aspect-[4/3] bg-slate-100 relative">
                      {img ? (
                        <img src={img} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImagePlus size={24} className="text-slate-300" />
                        </div>
                      )}
                      {/* Status badge */}
                      {item.status === "done" && (
                        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow">
                          <Check size={12} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                      {item.status === "reserved" && (
                        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-pink-200 flex items-center justify-center shadow">
                          <span className="text-[10px]">🎁</span>
                        </div>
                      )}
                      {/* URL link */}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 w-6 h-6 rounded-md bg-white/80 flex items-center justify-center shadow text-indigo-500 hover:text-indigo-700 transition-colors">
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <p className={clsx("text-[14px] font-medium text-slate-800 leading-snug", item.status === "done" && "line-through text-slate-400")}>
                        {item.title}
                      </p>
                      {item.note && item.status !== "reserved" && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{item.note}</p>
                      )}
                      {item.status === "reserved" && item.reserved_by && (
                        <p className="text-[11px] text-pink-500 font-medium mt-0.5">🎁 {item.reserved_by}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        {item.price && (
                          <span className="text-[13px] font-semibold tabular-nums text-slate-600">
                            {parseFloat(item.price).toLocaleString("ru-RU")} ₽
                          </span>
                        )}
                        {isGiftlist && item.status === "open" && (
                          <button
                            onClick={() => { setReservingId(item.id); setReserveName(""); }}
                            className="ml-auto text-[10px] font-semibold px-2 py-1 rounded-lg bg-pink-100 text-pink-600 hover:bg-pink-200 transition-colors"
                          >
                            Я подарю
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
        )}

        {/* Reserve modal */}
        {reservingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setReservingId(null)}>
            <div className="bg-white rounded-2xl p-5 w-[320px] shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[16px] font-bold text-slate-800 mb-3">Зарезервировать подарок</h3>
              <p className="text-[13px] text-slate-500 mb-3">Введите ваше имя, чтобы владелец списка знал, что подарок за вами</p>
              <input
                value={reserveName}
                onChange={(e) => setReserveName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full px-3 h-10 text-[15px] rounded-xl border border-slate-300 focus:outline-none focus:border-indigo-500 mb-3"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setReservingId(null)} className="flex-1 py-2 text-[13px] font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  Отмена
                </button>
                <button
                  onClick={() => reserveName.trim() && reserveItem({ itemId: reservingId, name: reserveName.trim() })}
                  disabled={reserving || !reserveName.trim()}
                  className="flex-1 py-2 text-[13px] font-semibold rounded-xl bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-50 transition-colors"
                >
                  {reserving ? "..." : "Подтвердить"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
