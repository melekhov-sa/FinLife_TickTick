"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { Pencil, Check, X, Archive, ArchiveRestore, Plus } from "lucide-react";
import { clsx } from "clsx";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkCategory {
  category_id: number;
  title: string;
  emoji: string | null;
  is_archived: boolean;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

function useWorkCategories(includeArchived: boolean) {
  return useQuery<WorkCategory[]>({
    queryKey: ["work-categories", includeArchived],
    queryFn: () => api.get<WorkCategory[]>("/api/v2/work-categories/all"),
    staleTime: 30_000,
    select: (data) =>
      includeArchived ? data : data.filter((c) => !c.is_archived),
  });
}

function useCreateWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; emoji: string | null }) =>
      api.post("/api/v2/work-categories", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-categories"] }),
  });
}

function useUpdateWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      title,
      emoji,
    }: {
      categoryId: number;
      title?: string;
      emoji?: string | null;
    }) => api.patch(`/api/v2/work-categories/${categoryId}`, { title, emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-categories"] }),
  });
}

function useArchiveWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) =>
      api.post(`/api/v2/work-categories/${categoryId}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-categories"] }),
  });
}

function useRestoreWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) =>
      api.post(`/api/v2/work-categories/${categoryId}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-categories"] }),
  });
}

// ── WorkCategoryRow ──────────────────────────────────────────────────────────

function WorkCategoryRow({ cat }: { cat: WorkCategory }) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(cat.title);
  const [editEmoji, setEditEmoji] = useState(cat.emoji ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  const { mutate: update, isPending: updating } = useUpdateWorkCategory();
  const { mutate: archive } = useArchiveWorkCategory();
  const { mutate: restore } = useRestoreWorkCategory();

  function startEdit() {
    setEditTitle(cat.title);
    setEditEmoji(cat.emoji ?? "");
    setEditing(true);
    setTimeout(() => titleRef.current?.select(), 30);
  }

  function save() {
    const t = editTitle.trim();
    if (!t) return;
    const e = editEmoji.trim() || null;
    update({ categoryId: cat.category_id, title: t, emoji: e });
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
    setEditTitle(cat.title);
    setEditEmoji(cat.emoji ?? "");
  }

  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] transition-colors",
        cat.is_archived ? "opacity-50" : "hover:bg-white/[0.02]"
      )}
    >
      {editing ? (
        <>
          <input
            value={editEmoji}
            onChange={(e) => setEditEmoji(e.target.value)}
            placeholder="📁"
            className="w-10 text-center text-[16px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-1 py-1 outline-none focus:border-indigo-500/50"
            style={{ color: "var(--t-primary)" }}
          />
          <input
            ref={titleRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") cancel();
            }}
            className="flex-1 text-[13px] bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2.5 py-1 outline-none"
            style={{ color: "var(--t-primary)" }}
            autoFocus
          />
          <button
            onClick={save}
            disabled={updating || !editTitle.trim()}
            className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors disabled:opacity-40"
          >
            <Check size={11} strokeWidth={2.5} />
          </button>
          <button
            onClick={cancel}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={11} />
          </button>
        </>
      ) : (
        <>
          <span className="text-lg shrink-0">{cat.emoji ?? "📁"}</span>
          <span
            className="flex-1 text-[14px] font-medium"
            style={{
              color: cat.is_archived ? "var(--t-faint)" : "var(--t-primary)",
            }}
          >
            {cat.title}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {!cat.is_archived && (
              <button
                onClick={startEdit}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-colors opacity-0 group-hover/row:opacity-100"
                style={{ color: "var(--t-faint)" }}
                title="Изменить"
              >
                <Pencil size={12} />
              </button>
            )}
            {cat.is_archived ? (
              <button
                onClick={() => restore(cat.category_id)}
                className="flex items-center gap-1 py-1 px-2 rounded-lg border border-white/[0.07] text-[11px] hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400 transition-all"
                style={{ color: "var(--t-faint)" }}
                title="Восстановить"
              >
                <ArchiveRestore size={11} />
                <span>Восстановить</span>
              </button>
            ) : (
              <button
                onClick={() => archive(cat.category_id)}
                className="flex items-center gap-1 py-1 px-2 rounded-lg border border-white/[0.07] text-[11px] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-all"
                style={{ color: "var(--t-faint)" }}
                title="В архив"
              >
                <Archive size={11} />
                <span>В архив</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── AddCategoryForm ──────────────────────────────────────────────────────────

function AddCategoryForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("");

  const { mutate: create, isPending } = useCreateWorkCategory();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create(
      { title: t, emoji: emoji.trim() || null },
      {
        onSuccess: () => {
          setTitle("");
          setEmoji("");
          onDone();
        },
      }
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-t border-white/[0.06]"
    >
      <input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="📁"
        className="w-10 text-center text-[16px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-1 py-1.5 outline-none focus:border-indigo-500/50 shrink-0"
        style={{ color: "var(--t-primary)" }}
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название категории"
        className="flex-1 text-[13px] bg-white/[0.06] border border-white/[0.1] rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500/50"
        style={{ color: "var(--t-primary)" }}
        autoFocus
      />
      <button
        type="submit"
        disabled={isPending || !title.trim()}
        className="text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 transition-colors shrink-0"
      >
        {isPending ? "..." : "Добавить"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors shrink-0"
        style={{ color: "var(--t-faint)" }}
      >
        <X size={13} />
      </button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function WorkCategoriesPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading, isError, error } = useWorkCategories(includeArchived);
  const cats = data ?? [];

  const activeCount = cats.filter((c) => !c.is_archived).length;

  return (
    <>
      <AppTopbar
        title="Категории дел"
        subtitle="Для задач, привычек и событий"
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">

        {/* Controls */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
            {activeCount} {activeCount === 1 ? "категория" : activeCount >= 2 && activeCount <= 4 ? "категории" : "категорий"}
          </span>

          <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
              Архивные
            </span>
            <div
              onClick={() => setIncludeArchived((v) => !v)}
              className={clsx(
                "w-8 h-4 rounded-full transition-colors relative cursor-pointer",
                includeArchived ? "bg-indigo-600" : "bg-white/[0.12]"
              )}
            >
              <div
                className={clsx(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                  includeArchived ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </div>
          </label>
        </div>

        {/* List */}
        {isLoading && (
          <div className="space-y-px">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-white/[0.03] rounded animate-pulse mb-px" />
            ))}
          </div>
        )}

        {isError && (
          <div className="text-center py-12">
            <p className="text-red-400/70 text-sm">Не удалось загрузить категории</p>
            {error && <p className="text-[11px] text-white/30 mt-2">{String(error)}</p>}
          </div>
        )}

        {!isLoading && !isError && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            {cats.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: "var(--t-muted)" }}>
                Нет категорий
              </div>
            ) : (
              <div>
                {cats.map((cat) => (
                  <div key={cat.category_id} className="group/row">
                    <WorkCategoryRow cat={cat} />
                  </div>
                ))}
              </div>
            )}

            {showAddForm ? (
              <AddCategoryForm onDone={() => setShowAddForm(false)} />
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-white/[0.03] transition-colors border-t border-white/[0.05]"
                style={{ color: "var(--t-faint)" }}
              >
                <Plus size={13} />
                Добавить категорию
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}
