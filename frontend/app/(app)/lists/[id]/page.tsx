"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { clsx } from "clsx";
import { Plus, Globe, Lock, Check, Trash2, ExternalLink, FolderPlus, Copy, List, LayoutGrid, Pencil, ImagePlus, X, Columns3 } from "lucide-react";
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

type ViewMode = "list" | "grid" | "kanban";

const ROADMAP_STATUSES: Record<string, { label: string; color: string; bg: string }> = {
  done:        { label: "Готово",    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/15" },
  in_progress: { label: "В работе",  color: "text-amber-600 dark:text-amber-400",    bg: "bg-amber-100 dark:bg-amber-500/15" },
  open:        { label: "План",      color: "text-slate-500 dark:text-slate-400",     bg: "bg-slate-100 dark:bg-white/[0.06]" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function imageUrl(item: ListItem): string | null {
  if (!item.image_url) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}${item.image_url}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const listId = Number(id);
  const qc = useQueryClient();

  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [viewInited, setViewInited] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: list, isLoading } = useQuery<SharedListFull>({
    queryKey: ["shared-list", listId],
    queryFn: () => api.get<SharedListFull>(`/api/v2/lists/${listId}`),
    staleTime: 15_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["shared-list", listId] });

  // Set default view once list loads: kanban for roadmaps, saved preference for others
  useEffect(() => {
    if (!list || viewInited) return;
    if (list.list_type === "roadmap") {
      setViewMode("kanban");
    } else {
      const saved = localStorage.getItem("list-view") as ViewMode | null;
      if (saved === "list" || saved === "grid") setViewMode(saved);
    }
    setViewInited(true);
  }, [list, viewInited]);

  useEffect(() => {
    if (viewInited && viewMode !== "kanban") localStorage.setItem("list-view", viewMode);
  }, [viewMode, viewInited]);

  // ── Mutations ────────────────────────────────────────────────────────

  const { mutate: togglePublic } = useMutation({
    mutationFn: (isPublic: boolean) => api.patch(`/api/v2/lists/${listId}`, { is_public: isPublic }),
    onSuccess: invalidate,
  });

  const [creatingItem, setCreatingItem] = useState(false);

  const { mutate: updateItem } = useMutation({
    mutationFn: ({ itemId, ...body }: { itemId: number } & Record<string, unknown>) =>
      api.patch(`/api/v2/lists/items/${itemId}`, body),
    onSuccess: () => { invalidate(); setEditingItem(null); },
  });

  const { mutate: deleteItem } = useMutation({
    mutationFn: (itemId: number) => api.delete(`/api/v2/lists/items/${itemId}`),
    onSuccess: invalidate,
  });

  const { mutate: uploadImage } = useMutation({
    mutationFn: ({ itemId, file }: { itemId: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.postForm(`/api/v2/lists/items/${itemId}/image`, fd);
    },
    onSuccess: invalidate,
  });

  const { mutate: deleteImage } = useMutation({
    mutationFn: (itemId: number) => api.delete(`/api/v2/lists/items/${itemId}/image`),
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
  const [itemFile, setItemFile] = useState<File | null>(null);
  const createFileRef = useRef<HTMLInputElement>(null);

  // ── Edit item form state ─────────────────────────────────────────────

  const [editTitle, setEditTitle] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editGroupId, setEditGroupId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openEdit(item: ListItem) {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditPrice(item.price ?? "");
    setEditUrl(item.url ?? "");
    setEditNote(item.note ?? "");
    setEditGroupId(item.group_id);
  }

  async function handleAddItem() {
    if (!itemTitle.trim()) return;
    setCreatingItem(true);
    try {
      const created = await api.post<{ id: number }>(`/api/v2/lists/${listId}/items`, {
        title: itemTitle.trim(),
        price: itemPrice ? parseFloat(itemPrice) : null,
        url: itemUrl.trim() || null,
        note: itemNote.trim() || null,
        group_id: itemGroupId,
      });
      if (itemFile && created?.id) {
        const fd = new FormData();
        fd.append("file", itemFile);
        await api.postForm(`/api/v2/lists/items/${created.id}/image`, fd);
      }
      invalidate();
      setShowAddItem(false);
    } catch { /* ignore */ }
    setCreatingItem(false);
    setItemTitle(""); setItemPrice(""); setItemUrl(""); setItemNote(""); setItemGroupId(null); setItemFile(null);
  }

  function handleEditSave() {
    if (!editingItem || !editTitle.trim()) return;
    updateItem({
      itemId: editingItem.id,
      title: editTitle.trim(),
      price: editPrice ? parseFloat(editPrice) : null,
      url: editUrl.trim() || null,
      note: editNote.trim() || null,
      group_id: editGroupId,
    });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingItem) return;
    uploadImage({ itemId: editingItem.id, file });
    e.target.value = "";
  }

  function handleAddGroup() {
    if (!groupTitle.trim()) return;
    createGroup({ title: groupTitle.trim() });
    setGroupTitle("");
  }

  // ── Grouped items ────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    if (!list) return [];
    const ungrouped = list.items.filter((it) => !it.group_id);
    const byGroup = list.groups.map((g) => ({
      group: g,
      items: list.items.filter((it) => it.group_id === g.id),
    }));
    const result: { group: ListGroup | null; items: ListItem[] }[] = [];
    if (ungrouped.length > 0) result.push({ group: null, items: ungrouped });
    result.push(...byGroup);
    return result;
  }, [list]);

  function copyShareLink() {
    if (!list) return;
    const url = `${window.location.origin}/share/${list.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  }

  const isWishOrGift = list?.list_type === "wishlist" || list?.list_type === "giftlist";
  const inputCls = "w-full px-3 h-10 text-[15px] rounded-xl border focus:outline-none focus:border-indigo-500/60 bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85";
  const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500";

  // ── Render helpers ───────────────────────────────────────────────────

  function renderListItem(item: ListItem) {
    const img = imageUrl(item);
    return (
      <div
        key={item.id}
        className={clsx(
          "flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-slate-100 dark:border-white/[0.04] group/item transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
          item.status === "done" && "opacity-60"
        )}
      >
        <button onClick={() => updateItem({ itemId: item.id, status: item.status === "done" ? "open" : "done" })} className="shrink-0 touch-manipulation">
          {item.status === "done" ? (
            <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center"><Check size={10} className="text-white" strokeWidth={3} /></div>
          ) : item.status === "reserved" ? (
            <div className="w-[18px] h-[18px] rounded-full bg-pink-100 dark:bg-pink-500/20 border-[1.5px] border-pink-300 flex items-center justify-center"><span className="text-[8px]">🎁</span></div>
          ) : (
            <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-slate-300 dark:border-white/30" />
          )}
        </button>

        {img && (
          <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-slate-100">
            <img src={img} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className={clsx("text-[14px] font-medium truncate", item.status === "done" && "line-through decoration-slate-300")} style={{ color: item.status === "done" ? "var(--t-muted)" : "var(--t-primary)" }}>
            {item.title}
          </p>
          {(item.note || item.reserved_by) && (
            <p className="text-[11px] truncate" style={{ color: "var(--t-faint)" }}>
              {item.reserved_by ? `🎁 ${item.reserved_by}` : item.note}
            </p>
          )}
        </div>

        {item.price && <span className="text-[13px] font-semibold tabular-nums shrink-0" style={{ color: "var(--t-secondary)" }}>{parseFloat(item.price).toLocaleString("ru-RU")} ₽</span>}
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="shrink-0 w-7 h-7 flex items-center justify-center rounded hover:bg-indigo-50 dark:hover:bg-indigo-500/10" style={{ color: "var(--t-faint)" }}><ExternalLink size={13} /></a>}
        <button onClick={() => openEdit(item)} className="shrink-0 w-7 h-7 flex items-center justify-center rounded md:opacity-0 md:group-hover/item:opacity-100 transition-all hover:bg-slate-100 dark:hover:bg-white/[0.06]" style={{ color: "var(--t-faint)" }} title="Редактировать"><Pencil size={13} /></button>
        <button onClick={() => deleteItem(item.id)} className="shrink-0 w-7 h-7 flex items-center justify-center rounded md:opacity-0 md:group-hover/item:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500" style={{ color: "var(--t-faint)" }} title="Удалить"><Trash2 size={13} /></button>
      </div>
    );
  }

  function renderGridItem(item: ListItem) {
    const img = imageUrl(item);
    return (
      <div
        key={item.id}
        className={clsx(
          "rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden group/item transition-all hover:shadow-md",
          item.status === "done" && "opacity-50"
        )}
      >
        {/* Cover image */}
        <div className="aspect-[4/3] bg-slate-100 dark:bg-white/[0.04] relative">
          {img ? (
            <img src={img} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImagePlus size={24} className="text-slate-300 dark:text-white/20" />
            </div>
          )}
          {/* Status badge */}
          <button
            onClick={() => updateItem({ itemId: item.id, status: item.status === "done" ? "open" : "done" })}
            className="absolute top-2 left-2 touch-manipulation"
          >
            {item.status === "done" ? (
              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow"><Check size={12} className="text-white" strokeWidth={3} /></div>
            ) : item.status === "reserved" ? (
              <div className="w-6 h-6 rounded-full bg-pink-200 flex items-center justify-center shadow"><span className="text-[10px]">🎁</span></div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/80 dark:bg-black/30 border-2 border-slate-300 dark:border-white/40 shadow" />
            )}
          </button>
          {/* Actions */}
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/item:opacity-100 transition-all">
            <button onClick={() => openEdit(item)} className="w-6 h-6 rounded-md bg-white/80 dark:bg-black/40 flex items-center justify-center shadow hover:bg-white" style={{ color: "var(--t-secondary)" }}><Pencil size={11} /></button>
            <button onClick={() => deleteItem(item.id)} className="w-6 h-6 rounded-md bg-white/80 dark:bg-black/40 flex items-center justify-center shadow hover:bg-red-50 hover:text-red-500" style={{ color: "var(--t-secondary)" }}><Trash2 size={11} /></button>
          </div>
        </div>
        {/* Info */}
        <div className="p-2.5">
          <p className={clsx("text-[13px] font-medium truncate", item.status === "done" && "line-through")} style={{ color: item.status === "done" ? "var(--t-muted)" : "var(--t-primary)" }}>
            {item.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {item.price && <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-secondary)" }}>{parseFloat(item.price).toLocaleString("ru-RU")} ₽</span>}
            {item.reserved_by && <span className="text-[10px] text-pink-500 font-medium truncate">🎁 {item.reserved_by}</span>}
          </div>
        </div>
      </div>
    );
  }

  function renderKanbanCard(item: ListItem) {
    const st = ROADMAP_STATUSES[item.status] ?? ROADMAP_STATUSES.open;
    return (
      <div
        key={item.id}
        className="rounded-lg border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-2.5 group/card hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-1.5">
          <p className="text-[13px] font-medium leading-snug flex-1 min-w-0" style={{ color: "var(--t-primary)" }}>
            {item.title}
          </p>
          <div className="flex gap-0.5 shrink-0 opacity-0 group-hover/card:opacity-100 transition-all">
            <button onClick={() => openEdit(item)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/[0.06]" style={{ color: "var(--t-faint)" }}><Pencil size={10} /></button>
            <button onClick={() => deleteItem(item.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-50 hover:text-red-500" style={{ color: "var(--t-faint)" }}><Trash2 size={10} /></button>
          </div>
        </div>
        {item.note && <p className="text-[11px] mt-1 line-clamp-2" style={{ color: "var(--t-faint)" }}>{item.note}</p>}
        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={() => {
              const cycle = ["open", "in_progress", "done"];
              const next = cycle[(cycle.indexOf(item.status) + 1) % cycle.length];
              updateItem({ itemId: item.id, status: next });
            }}
            className={clsx("text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded transition-colors", st.color, st.bg)}
          >
            {st.label}
          </button>
        </div>
      </div>
    );
  }

  function renderKanban() {
    if (!list) return null;
    const groups = list.groups.length > 0 ? list.groups : [{ id: 0, title: "Все", sort_order: 0, color: null }];
    return (
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-3 px-3 md:-mx-6 md:px-6">
        {groups.map((group) => {
          const colItems = group.id === 0
            ? list.items
            : list.items.filter((it) => it.group_id === group.id);

          return (
            <div key={group.id} className="w-[260px] md:w-[280px] shrink-0 flex flex-col">
              <div className="flex items-center gap-2 mb-2 px-1">
                <h3 className="text-[13px] font-bold" style={{ color: "var(--t-primary)" }}>{group.title}</h3>
                <span className="text-[10px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full" style={{ color: "var(--t-muted)" }}>{colItems.length}</span>
                <button
                  onClick={() => { setItemGroupId(group.id === 0 ? null : group.id); setShowAddItem(true); }}
                  className="ml-auto w-5 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                  style={{ color: "var(--t-faint)" }}
                >
                  <Plus size={12} />
                </button>
              </div>
              <div className="flex-1 space-y-1.5 rounded-xl bg-slate-50/80 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.04] p-2 min-h-[100px]">
                {colItems.map(renderKanbanCard)}
                {colItems.length === 0 && (
                  <p className="text-[11px] text-center py-4" style={{ color: "var(--t-faint)" }}>Пусто</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Add item modal */}
      {showAddItem && (
        <BottomSheet open onClose={() => setShowAddItem(false)} title="Добавить элемент" footer={
          <button onClick={handleAddItem} disabled={creatingItem || !itemTitle.trim()} className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
            {creatingItem ? "..." : "Добавить"}
          </button>
        }>
          <div className="space-y-3">
            <div><label className={labelCls}>Название *</label><input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="iPhone 16 Pro" className={inputCls} autoFocus /></div>
            {isWishOrGift && <div><label className={labelCls}>Цена</label><input type="number" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="0" className={inputCls} /></div>}
            <div><label className={labelCls}>Ссылка</label><input value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://..." className={inputCls} /></div>
            <div><label className={labelCls}>Заметка</label><input value={itemNote} onChange={(e) => setItemNote(e.target.value)} placeholder="Цвет: титан" className={inputCls} /></div>
            {(list?.groups.length ?? 0) > 0 && (
              <div><label className={labelCls}>Группа</label>
                <select value={itemGroupId ?? ""} onChange={(e) => setItemGroupId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                  <option value="">Без группы</option>
                  {list?.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>
            )}
            {/* Image */}
            <div>
              <label className={labelCls}>Обложка</label>
              {itemFile ? (
                <div className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03]">
                  <img src={URL.createObjectURL(itemFile)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  <span className="text-[13px] truncate flex-1" style={{ color: "var(--t-secondary)" }}>{itemFile.name}</span>
                  <button onClick={() => setItemFile(null)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 hover:text-red-500" style={{ color: "var(--t-faint)" }}><X size={14} /></button>
                </div>
              ) : (
                <button
                  onClick={() => createFileRef.current?.click()}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/[0.08] flex flex-col items-center gap-1 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                  style={{ color: "var(--t-faint)" }}
                >
                  <ImagePlus size={18} />
                  <span className="text-[12px] font-medium">Загрузить фото</span>
                </button>
              )}
              <input ref={createFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setItemFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Edit item modal */}
      {editingItem && (
        <BottomSheet open onClose={() => setEditingItem(null)} title="Редактировать" footer={
          <button onClick={handleEditSave} disabled={!editTitle.trim()} className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
            Сохранить
          </button>
        }>
          <div className="space-y-3">
            <div><label className={labelCls}>Название *</label><input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} autoFocus /></div>
            {isWishOrGift && <div><label className={labelCls}>Цена</label><input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className={inputCls} /></div>}
            <div><label className={labelCls}>Ссылка</label><input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className={inputCls} /></div>
            <div><label className={labelCls}>Заметка</label><input value={editNote} onChange={(e) => setEditNote(e.target.value)} className={inputCls} /></div>
            {(list?.groups.length ?? 0) > 0 && (
              <div><label className={labelCls}>Группа</label>
                <select value={editGroupId ?? ""} onChange={(e) => setEditGroupId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                  <option value="">Без группы</option>
                  {list?.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              </div>
            )}

            {/* Image section */}
            <div>
              <label className={labelCls}>Обложка</label>
              {editingItem.image_url ? (
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-100">
                  <img src={imageUrl(editingItem)!} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => deleteImage(editingItem.id)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-white/[0.08] flex flex-col items-center gap-1.5 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
                  style={{ color: "var(--t-faint)" }}
                >
                  <ImagePlus size={20} />
                  <span className="text-[12px] font-medium">Загрузить фото</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Add group modal */}
      {showAddGroup && (
        <BottomSheet open onClose={() => setShowAddGroup(false)} title="Новая группа" footer={
          <button onClick={handleAddGroup} disabled={creatingGroup || !groupTitle.trim()} className="w-full py-2.5 text-[14px] font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
            {creatingGroup ? "..." : "Создать"}
          </button>
        }>
          <div><label className={labelCls}>Название группы</label><input value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="Техника" className={inputCls} autoFocus /></div>
        </BottomSheet>
      )}

      <AppTopbar title={list?.title ?? "Список"} />
      <main className="flex-1 overflow-auto p-3 md:p-6 touch-manipulation">
        <div className={viewMode === "kanban" ? "" : "max-w-[700px]"}>

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
                  <button onClick={copyShareLink} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] hover:bg-slate-50" style={{ color: "var(--t-secondary)" }}>
                    <Copy size={13} />
                    {copiedSlug ? "Скопировано!" : "Ссылка"}
                  </button>
                )}

                {/* View mode toggle */}
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] rounded-lg p-0.5">
                  <button onClick={() => setViewMode("list")} className={clsx("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-white dark:bg-white/[0.12] shadow-sm" : "")} style={{ color: viewMode === "list" ? "var(--t-primary)" : "var(--t-faint)" }}><List size={14} /></button>
                  <button onClick={() => setViewMode("grid")} className={clsx("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-white dark:bg-white/[0.12] shadow-sm" : "")} style={{ color: viewMode === "grid" ? "var(--t-primary)" : "var(--t-faint)" }}><LayoutGrid size={14} /></button>
                  <button onClick={() => setViewMode("kanban")} className={clsx("p-1.5 rounded-md transition-all", viewMode === "kanban" ? "bg-white dark:bg-white/[0.12] shadow-sm" : "")} style={{ color: viewMode === "kanban" ? "var(--t-primary)" : "var(--t-faint)" }}><Columns3 size={14} /></button>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button onClick={() => setShowAddGroup(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.04] hover:bg-slate-50" style={{ color: "var(--t-secondary)" }}>
                    <FolderPlus size={13} /><span className="hidden md:inline">Группа</span>
                  </button>
                  <button onClick={() => setShowAddItem(true)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 transition-colors shadow-sm">
                    <Plus size={14} /><span className="hidden md:inline">Добавить</span>
                  </button>
                </div>
              </div>

              {list.description && <p className="text-[13px] mb-4" style={{ color: "var(--t-muted)" }}>{list.description}</p>}

              {grouped.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>Список пуст</p>
                  <button onClick={() => setShowAddItem(true)} className="mt-3 text-[13px] font-medium text-indigo-500 hover:text-indigo-600 transition-colors">+ Добавить первый элемент</button>
                </div>
              )}

              {viewMode === "kanban" ? (
                renderKanban()
              ) : (
                grouped.map(({ group, items }) => (
                  <div key={group?.id ?? "ungrouped"} className="mb-4">
                    {group && (
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: "var(--t-muted)", opacity: 0.6 }}>{group.title}</h3>
                        <span className="text-[11px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full" style={{ color: "var(--t-muted)" }}>{items.length}</span>
                        <button onClick={() => deleteGroup(group.id)} className="ml-auto w-6 h-6 flex items-center justify-center rounded opacity-0 hover:opacity-100 transition-all hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500" style={{ color: "var(--t-faint)" }} title="Удалить группу"><Trash2 size={12} /></button>
                      </div>
                    )}

                    {viewMode === "list" ? (
                      <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] overflow-hidden">
                        {items.map(renderListItem)}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                        {items.map(renderGridItem)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
