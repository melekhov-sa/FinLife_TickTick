"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { clsx } from "clsx";
import { Plus, Globe, Lock, Check, Trash2, GripVertical, ExternalLink, FolderPlus, Copy } from "lucide-react";
import { api } from "@/lib/api";

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
  planned_op_template_id: number | null;
  sort_order: number;
  completed_at: string | null;
  created_at: string | null;
}

interface SharedListFull {
  id: number;
  title: string;
  description: string | null;
  list_type: string;
  slug: string;
  is_public: boolean;
  groups: ListGroup[];
  items: ListItem[];
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const listId = Number(id);
  const qc = useQueryClient();

  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: list, isLoading } = useQuery<SharedListFull>({
    queryKey: ["shared-list", listId],
    queryFn: () => api.get<SharedListFull>(`/api/v2/lists/${listId}`),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shared-list", listId] });

  // ── Mutations ────────────────────────────────────────────────────────

  const { mutate: togglePublic } = useMutation({
    mutationFn: (isPublic: boolean) => api.patch(`/api/v2/lists/${listId}`, { is_public: isPublic }),
    onSuccess: invalidate,
  });

  const { mutate: createItem, isPending: creatingItem } = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/api/v2/lists/${listId}/items`, body),
    onSuccess: () => { invalidate(); setShowAddItem(false); },
  });

  const { mutate: updateItem } = useMutation({
    mutationFn: ({ itemId, ...body }: { itemId: number } & Record<string, unknown>) =>
      api.patch(`/api/v2/lists/items/${itemId}`, body),
    onSuccess: invalidate,
  });

  const { mutate: deleteItem } = useMutation({
    mutationFn: (itemId: number) => api.delete(`/api/v2/lists/items/${itemId}`),
    onSuccess: invalidate,
  });

  const { mutate: createGroup, isPending: creatingGroup } = useMutation({
    mutationFn: (body: { title: string }) => api.post(`/api/v2/lists/${listId}/groups`, body),
    onSuccess: () => { invalidate(); setShowAddGroup(false); },
  });

  const { mutate: deleteGroup } = useMutation({
    mutationFn: (groupId: number) => api.delete(`/api/v2/lists/groups/${groupId}`),
    onSuccess: invalidate,
  });

  // ── Add item form state ──────────────────────────────────────────────

  const [itemTitle, setItemTitle] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [itemGroupId, setItemGroupId] = useState<number | null>(null);

  const [groupTitle, setGroupTitle] = useState("");

  function handleAddItem() {
    if (!itemTitle.trim()) return;
    createItem({
      title: itemTitle.trim(),
      price: itemPrice ? parseFloat(itemPrice) : null,
      url: itemUrl.trim() || null,
      note: itemNote.trim() || null,
      group_id: itemGroupId,
    });
    setItemTitle(""); setItemPrice(""); setItemUrl(""); setItemNote(""); setItemGroupId(null);
  }

  function handleAddGroup() {
    if (!groupTitle.trim()) return;
    createGroup({ title: groupTitle.trim() });
    setGroupTitle("");
  }

  // ── Grouped items ────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    if (!list) return [];
    const groups = list.groups;
    const ungrouped = list.items.filter((it) => !it.group_id);
    const byGroup = groups.map((g) => ({
      group: g,
      items: list.items.filter((it) => it.group_id === g.id),
    }));

    const result: { group: ListGroup | null; items: ListItem[] }[] = [];
    if (ungrouped.length > 0) result.push({ group: null, items: ungrouped });
    result.push(...byGroup);
    return result;
  }, [list]);

  // ── Share link ───────────────────────────────────────────────────────

  function copyShareLink() {
    if (!list) return;
    const url = `${window.location.origin}/share/${list.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  }

  // ── Render ───────────────────────────────────────────────────────────

  const isWishOrGift = list?.list_type === "wishlist" || list?.list_type === "giftlist";
  const inputCls = "w-full px-3 h-10 text-[15px] rounded-xl border focus:outline-none focus:border-indigo-500/60 bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85";
  const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500";

  return (
    <>
      {/* Add item modal */}
      {showAddItem && (
        <BottomSheet
          open
          onClose={() => setShowAddItem(false)}
          title="Добавить элемент"
          footer={
            <button onClick={handleAddItem} disabled={creatingItem || !itemTitle.trim()} className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
              {creatingItem ? "..." : "Добавить"}
            </button>
          }
        >
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Название *</label>
              <input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="iPhone 16 Pro" className={inputCls} autoFocus />
            </div>
            {isWishOrGift && (
              <div>
                <label className={labelCls}>Цена</label>
                <input type="number" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="0" className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>Ссылка</label>
              <input value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://..." className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Заметка</label>
              <input value={itemNote} onChange={(e) => setItemNote(e.target.value)} placeholder="Цвет: титан" className={inputCls} />
            </div>
            {(list?.groups.length ?? 0) > 0 && (
              <div>
                <label className={labelCls}>Группа</label>
                <select
                  value={itemGroupId ?? ""}
                  onChange={(e) => setItemGroupId(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}
                >
                  <option value="">Без группы</option>
                  {list?.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* Add group modal */}
      {showAddGroup && (
        <BottomSheet
          open
          onClose={() => setShowAddGroup(false)}
          title="Новая группа"
          footer={
            <button onClick={handleAddGroup} disabled={creatingGroup || !groupTitle.trim()} className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
              {creatingGroup ? "..." : "Создать"}
            </button>
          }
        >
          <div>
            <label className={labelCls}>Название группы</label>
            <input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Техника" className={inputCls} autoFocus />
          </div>
        </BottomSheet>
      )}

      <AppTopbar title={list?.title ?? "Список"} />
      <main className="flex-1 overflow-auto p-3 md:p-6 touch-manipulation">
        <div className="max-w-[700px]">

          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-slate-100 dark:bg-white/[0.02] rounded-xl animate-pulse" />)}
            </div>
          )}

          {list && (
            <>
              {/* Header actions */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <button
                  onClick={() => togglePublic(!list.is_public)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors",
                    list.is_public
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-slate-50 dark:bg-white/[0.04] border-slate-200 dark:border-white/[0.07]"
                  )}
                  style={{ color: list.is_public ? undefined : "var(--t-secondary)" }}
                >
                  {list.is_public ? <Globe size={13} /> : <Lock size={13} />}
                  {list.is_public ? "Публичный" : "Приватный"}
                </button>

                {list.is_public && (
                  <button
                    onClick={copyShareLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] transition-colors hover:bg-slate-50"
                    style={{ color: "var(--t-secondary)" }}
                  >
                    <Copy size={13} />
                    {copiedSlug ? "Скопировано!" : "Скопировать ссылку"}
                  </button>
                )}

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={() => setShowAddGroup(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] transition-colors hover:bg-slate-50"
                    style={{ color: "var(--t-secondary)" }}
                  >
                    <FolderPlus size={13} />
                    <span className="hidden md:inline">Группа</span>
                  </button>
                  <button
                    onClick={() => setShowAddItem(true)}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-sm"
                  >
                    <Plus size={14} />
                    <span className="hidden md:inline">Добавить</span>
                  </button>
                </div>
              </div>

              {/* Description */}
              {list.description && (
                <p className="text-[13px] mb-4" style={{ color: "var(--t-muted)" }}>{list.description}</p>
              )}

              {/* Items grouped */}
              {grouped.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>Список пуст</p>
                  <button onClick={() => setShowAddItem(true)} className="mt-3 text-[13px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
                    + Добавить первый элемент
                  </button>
                </div>
              )}

              {grouped.map(({ group, items }) => (
                <div key={group?.id ?? "ungrouped"} className="mb-4">
                  {group && (
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: "var(--t-muted)", opacity: 0.6 }}>
                        {group.title}
                      </h3>
                      <span className="text-[11px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full" style={{ color: "var(--t-muted)" }}>
                        {items.length}
                      </span>
                      <button
                        onClick={() => deleteGroup(group.id)}
                        className="ml-auto w-6 h-6 flex items-center justify-center rounded opacity-0 hover:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                        style={{ color: "var(--t-faint)" }}
                        title="Удалить группу"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className={clsx(
                          "flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-slate-100 dark:border-white/[0.04] group/item transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
                          item.status === "done" && "opacity-60"
                        )}
                      >
                        {/* Status toggle */}
                        <button
                          onClick={() => updateItem({ itemId: item.id, status: item.status === "done" ? "open" : "done" })}
                          className="shrink-0 touch-manipulation"
                        >
                          {item.status === "done" ? (
                            <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
                              <Check size={10} className="text-white" strokeWidth={3} />
                            </div>
                          ) : item.status === "reserved" ? (
                            <div className="w-[18px] h-[18px] rounded-full bg-pink-100 dark:bg-pink-500/20 border-[1.5px] border-pink-300 dark:border-pink-400/50 flex items-center justify-center">
                              <span className="text-[8px]">🎁</span>
                            </div>
                          ) : (
                            <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-slate-300 dark:border-white/30" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className={clsx("text-[14px] font-medium truncate", item.status === "done" && "line-through decoration-slate-300")} style={{ color: item.status === "done" ? "var(--t-muted)" : "var(--t-primary)" }}>
                            {item.title}
                          </p>
                          {(item.note || item.reserved_by) && (
                            <p className="text-[11px] truncate" style={{ color: "var(--t-faint)" }}>
                              {item.reserved_by ? `🎁 Зарезервировано: ${item.reserved_by}` : item.note}
                            </p>
                          )}
                        </div>

                        {/* Price */}
                        {item.price && (
                          <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: "var(--t-secondary)" }}>
                            {parseFloat(item.price).toLocaleString("ru-RU")} ₽
                          </span>
                        )}

                        {/* URL link */}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors" style={{ color: "var(--t-faint)" }}>
                            <ExternalLink size={13} />
                          </a>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded md:opacity-0 md:group-hover/item:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                          style={{ color: "var(--t-faint)" }}
                          title="Удалить"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </main>
    </>
  );
}
