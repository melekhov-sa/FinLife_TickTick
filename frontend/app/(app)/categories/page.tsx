"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { Pencil, Check, X, Archive, ArchiveRestore, Plus, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

// ── Types ───────────────────────────────────────────────────────────────────

interface FinCategory {
  category_id: number;
  title: string;
  category_type: string; // INCOME | EXPENSE
  parent_id: number | null;
  is_frequent: boolean;
  is_archived: boolean;
  is_system: boolean;
}

type TabType = "EXPENSE" | "INCOME";

// ── Hooks ───────────────────────────────────────────────────────────────────

function useCategories(includeArchived: boolean) {
  return useQuery<FinCategory[]>({
    queryKey: ["fin-categories", includeArchived],
    queryFn: () =>
      api.get<FinCategory[]>(
        `/api/v2/fin-categories?include_archived=${includeArchived}`
      ),
    staleTime: 30_000,
  });
}

function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      category_type: string;
      parent_id: number | null;
    }) => api.post("/api/v2/fin-categories", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-categories"] }),
  });
}

function useRenameCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      title,
    }: {
      categoryId: number;
      title: string;
    }) => api.patch(`/api/v2/fin-categories/${categoryId}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-categories"] }),
  });
}

function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) =>
      api.post(`/api/v2/fin-categories/${categoryId}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-categories"] }),
  });
}

function useRestoreCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) =>
      api.post(`/api/v2/fin-categories/${categoryId}/restore`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fin-categories"] }),
  });
}

// ── CategoryRow ─────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  isChild,
}: {
  cat: FinCategory;
  isChild: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(cat.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const { mutate: rename, isPending: renaming } = useRenameCategory();
  const { mutate: archive } = useArchiveCategory();
  const { mutate: restore } = useRestoreCategory();

  function startEdit() {
    setTitle(cat.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  }

  function saveTitle() {
    const t = title.trim();
    if (t && t !== cat.title) rename({ categoryId: cat.category_id, title: t });
    else setTitle(cat.title);
    setEditing(false);
  }

  function cancelEdit() {
    setTitle(cat.title);
    setEditing(false);
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-between border-b border-white/[0.05] transition-colors",
        isChild ? "px-4 py-2 pl-10" : "px-4 py-2.5",
        cat.is_archived ? "opacity-50" : "hover:bg-white/[0.02]"
      )}
    >
      {/* Title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveTitle();
                }
                if (e.key === "Escape") cancelEdit();
              }}
              className="text-[13px] bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2.5 py-1 outline-none w-52"
              style={{ color: "var(--t-primary)" }}
              autoFocus
            />
            <button
              onClick={saveTitle}
              disabled={renaming}
              className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors"
            >
              <Check size={11} strokeWidth={2.5} />
            </button>
            <button
              onClick={cancelEdit}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 group/title">
            {isChild && (
              <span className="text-[11px] mr-0.5" style={{ color: "var(--t-faint)" }}>
                └
              </span>
            )}
            <span
              className={clsx(
                "truncate",
                isChild ? "text-[13px]" : "text-[14px] font-semibold"
              )}
              style={{ color: isChild ? "var(--t-secondary)" : "var(--t-primary)" }}
            >
              {cat.title}
            </span>
            {cat.is_system && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08]" style={{ color: "var(--t-faint)" }}>
                система
              </span>
            )}
            {!cat.is_system && !cat.is_archived && (
              <button
                onClick={startEdit}
                className="opacity-0 group-hover/title:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-all"
                style={{ color: "var(--t-faint)" }}
                title="Переименовать"
              >
                <Pencil size={10} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {!cat.is_system && !editing && (
        <div className="flex items-center gap-1 ml-2 shrink-0">
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
      )}
    </div>
  );
}

// ── AddCategoryForm ──────────────────────────────────────────────────────────

function AddCategoryForm({
  activeTab,
  parents,
  onDone,
}: {
  activeTab: TabType;
  parents: FinCategory[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);

  const { mutate: create, isPending } = useCreateCategory();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create(
      { title: t, category_type: activeTab, parent_id: parentId },
      {
        onSuccess: () => {
          setTitle("");
          setParentId(null);
          onDone();
        },
      }
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 px-4 py-3 bg-white/[0.03] border-t border-white/[0.06]"
    >
      <div className="flex items-center gap-2">
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
          className="text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 transition-colors"
        >
          {isPending ? "..." : "Добавить"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <X size={13} />
        </button>
      </div>

      {parents.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
            Родительская:
          </span>
          <div className="relative">
            <select
              value={parentId ?? ""}
              onChange={(e) =>
                setParentId(e.target.value ? Number(e.target.value) : null)
              }
              className="text-[12px] bg-white/[0.06] border border-white/[0.1] rounded-lg pl-2.5 pr-6 py-1 outline-none appearance-none cursor-pointer"
              style={{ color: "var(--t-secondary)" }}
            >
              <option value="">— нет (корневая) —</option>
              {parents.map((p) => (
                <option key={p.category_id} value={p.category_id}>
                  {p.title}
                </option>
              ))}
            </select>
            <ChevronDown
              size={11}
              className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--t-faint)" }}
            />
          </div>
        </div>
      )}
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [activeTab, setActiveTab] = useState<TabType>("EXPENSE");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading, isError } = useCategories(includeArchived);
  const allCats = data ?? [];

  const tabCats = allCats.filter((c) => c.category_type === activeTab);

  // Build hierarchy
  const parents = tabCats.filter((c) => c.parent_id === null);
  const childrenMap = new Map<number, FinCategory[]>();
  for (const c of tabCats) {
    if (c.parent_id !== null) {
      if (!childrenMap.has(c.parent_id)) childrenMap.set(c.parent_id, []);
      childrenMap.get(c.parent_id)!.push(c);
    }
  }

  // Orphaned children (parent not in current view)
  const parentIds = new Set(parents.map((p) => p.category_id));
  const orphans = tabCats.filter(
    (c) => c.parent_id !== null && !parentIds.has(c.parent_id)
  );

  const activeParents = parents.filter((p) => !p.is_archived || includeArchived);

  const expenseCount = allCats.filter(
    (c) => c.category_type === "EXPENSE" && !c.is_archived
  ).length;
  const incomeCount = allCats.filter(
    (c) => c.category_type === "INCOME" && !c.is_archived
  ).length;

  return (
    <>
      <AppTopbar
        title="Статьи"
        subtitle="Категории доходов и расходов"
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => { setActiveTab("EXPENSE"); setShowAddForm(false); }}
            className={clsx(
              "px-4 py-1.5 rounded-xl text-[13px] font-semibold border transition-all",
              activeTab === "EXPENSE"
                ? "bg-red-500/15 border-red-500/30 text-red-400"
                : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]"
            )}
            style={{ color: activeTab !== "EXPENSE" ? "var(--t-secondary)" : undefined }}
          >
            Расходы
            <span className="ml-1.5 text-[11px] opacity-70">({expenseCount})</span>
          </button>
          <button
            onClick={() => { setActiveTab("INCOME"); setShowAddForm(false); }}
            className={clsx(
              "px-4 py-1.5 rounded-xl text-[13px] font-semibold border transition-all",
              activeTab === "INCOME"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]"
            )}
            style={{ color: activeTab !== "INCOME" ? "var(--t-secondary)" : undefined }}
          >
            Доходы
            <span className="ml-1.5 text-[11px] opacity-70">({incomeCount})</span>
          </button>

          <label className="ml-auto flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
              Архивные
            </span>
            <div
              onClick={() => setIncludeArchived((v) => !v)}
              className={clsx(
                "w-8 h-4 rounded-full transition-colors relative",
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
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-white/[0.03] rounded animate-pulse mb-px" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить категории
          </p>
        )}

        {!isLoading && !isError && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            {activeParents.length === 0 && orphans.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: "var(--t-muted)" }}>
                Нет категорий
              </div>
            ) : (
              <>
                {activeParents.map((parent) => {
                  const children = childrenMap.get(parent.category_id) ?? [];
                  return (
                    <div key={parent.category_id}>
                      <CategoryRow cat={parent} isChild={false} />
                      {children.map((child) => (
                        <CategoryRow key={child.category_id} cat={child} isChild={true} />
                      ))}
                    </div>
                  );
                })}

                {orphans.map((c) => (
                  <CategoryRow key={c.category_id} cat={c} isChild={true} />
                ))}
              </>
            )}

            {/* Add form or button */}
            {showAddForm ? (
              <AddCategoryForm
                activeTab={activeTab}
                parents={parents.filter((p) => !p.is_archived)}
                onDone={() => setShowAddForm(false)}
              />
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
